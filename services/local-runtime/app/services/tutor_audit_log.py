"""
Persistent audit log for tutor activity: all users, timestamps, full turns.

Used for future AI feedback / correction workflows and analytics.
Complements the response *cache* JSON files (reusable completions) — this
database stores *who* saw *what* and *when*.

Disable with env: TUTOR_AUDIT_DISABLE=1
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.services import tutor_supabase_sync

_AUDIT_DISABLED = os.environ.get("TUTOR_AUDIT_DISABLE", "").strip().lower() in (
    "1",
    "true",
    "yes",
)

_DATA_DIR = Path(os.environ.get("SKETCHBOT_DATA_DIR") or (Path(__file__).resolve().parents[2] / "data"))
_DB_PATH = _DATA_DIR / "tutor_audit.sqlite"

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None
_outbox_worker_started = False
_worker_start_lock = threading.Lock()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _connection() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(
            str(_DB_PATH),
            check_same_thread=False,
            isolation_level=None,
        )
        _conn.execute("PRAGMA journal_mode=WAL;")
        _conn.execute("PRAGMA synchronous=NORMAL;")
        _init_schema(_conn)
    return _conn


def _init_schema(c: sqlite3.Connection) -> None:
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS tutor_chat_turns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            student_name TEXT NOT NULL,
            concept_id TEXT NOT NULL,
            session_key TEXT NOT NULL,
            layer TEXT NOT NULL,
            age_group TEXT NOT NULL,
            trigger TEXT NOT NULL,
            user_message TEXT NOT NULL,
            assistant_reply TEXT NOT NULL,
            from_cache INTEGER NOT NULL DEFAULT 0,
            model_id TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
            history_message_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_turns_created ON tutor_chat_turns(created_at);
        CREATE INDEX IF NOT EXISTS idx_turns_student ON tutor_chat_turns(student_name);
        CREATE INDEX IF NOT EXISTS idx_turns_session ON tutor_chat_turns(session_key);
        CREATE INDEX IF NOT EXISTS idx_turns_concept ON tutor_chat_turns(concept_id);

        CREATE TABLE IF NOT EXISTS tutor_evaluation_turns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            student_name TEXT NOT NULL,
            concept_id TEXT NOT NULL,
            session_key TEXT NOT NULL,
            layer TEXT NOT NULL,
            age_group TEXT NOT NULL,
            drawing_prompt TEXT NOT NULL,
            path_count INTEGER NOT NULL,
            result_json TEXT NOT NULL,
            from_cache INTEGER NOT NULL DEFAULT 0,
            model_id TEXT NOT NULL DEFAULT 'claude-sonnet-4-6'
        );
        CREATE INDEX IF NOT EXISTS idx_eval_created ON tutor_evaluation_turns(created_at);
        CREATE INDEX IF NOT EXISTS idx_eval_student ON tutor_evaluation_turns(student_name);

        CREATE TABLE IF NOT EXISTS tutor_session_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            event_type TEXT NOT NULL,
            student_name TEXT NOT NULL,
            detail TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sess_ev_created ON tutor_session_events(created_at);

        CREATE TABLE IF NOT EXISTS supabase_sync_outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            enqueued_at TEXT NOT NULL,
            table_name TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sb_ob_enq ON supabase_sync_outbox(enqueued_at);
        """
    )


def _enqueue_supabase_outbox(table_name: str, row: dict[str, Any]) -> None:
    if _AUDIT_DISABLED or not tutor_supabase_sync.is_configured():
        return
    try:
        payload = json.dumps(row, ensure_ascii=False)
        with _lock:
            c = _connection()
            c.execute(
                """
                INSERT INTO supabase_sync_outbox (enqueued_at, table_name, payload_json)
                VALUES (?, ?, ?)
                """,
                (_utc_now_iso(), table_name, payload),
            )
    except sqlite3.Error:
        pass


def _sync_row_to_cloud(table_name: str, row: dict[str, Any]) -> None:
    """Best-effort Supabase insert; on failure queue for retry when offline."""
    if _AUDIT_DISABLED or not tutor_supabase_sync.is_configured():
        return
    if tutor_supabase_sync.push_row(table_name, row):
        return
    _enqueue_supabase_outbox(table_name, row)


def drain_supabase_outbox(*, max_batch: int = 100) -> int:
    """
    Retry queued rows (call periodically or on startup). Returns number of rows sent.
    """
    if not tutor_supabase_sync.is_configured():
        return 0
    sent = 0
    try:
        with _lock:
            c = _connection()
            cur = c.execute(
                """
                SELECT id, table_name, payload_json, attempts
                FROM supabase_sync_outbox
                ORDER BY id ASC
                LIMIT ?
                """,
                (max_batch,),
            )
            pending = cur.fetchall()
    except sqlite3.Error:
        return 0

    for row_id, table_name, payload_json, attempts in pending:
        try:
            payload = json.loads(payload_json)
        except json.JSONDecodeError:
            try:
                with _lock:
                    _connection().execute("DELETE FROM supabase_sync_outbox WHERE id = ?", (row_id,))
            except sqlite3.Error:
                pass
            continue
        if tutor_supabase_sync.push_row(table_name, payload):
            try:
                with _lock:
                    _connection().execute("DELETE FROM supabase_sync_outbox WHERE id = ?", (row_id,))
                sent += 1
            except sqlite3.Error:
                pass
        else:
            try:
                with _lock:
                    c = _connection()
                    if attempts >= 40:
                        c.execute("DELETE FROM supabase_sync_outbox WHERE id = ?", (row_id,))
                    else:
                        c.execute(
                            """
                            UPDATE supabase_sync_outbox
                            SET attempts = attempts + 1, last_error = ?
                            WHERE id = ?
                            """,
                            ("push_failed", row_id),
                        )
            except sqlite3.Error:
                pass
    return sent


def supabase_outbox_pending_count() -> int:
    """Rows waiting to sync (non-zero usually means Supabase rejected inserts — check server logs)."""
    try:
        with _lock:
            c = _connection()
            row = c.execute("SELECT COUNT(*) FROM supabase_sync_outbox").fetchone()
            return int(row[0]) if row else 0
    except sqlite3.Error:
        return -1


def start_supabase_outbox_worker() -> None:
    """Background retries when Supabase was unreachable; safe to call once at app startup."""
    global _outbox_worker_started
    with _worker_start_lock:
        if _outbox_worker_started:
            return
        _outbox_worker_started = True

    def _loop() -> None:
        time.sleep(2.0)
        while True:
            try:
                drain_supabase_outbox()
            except Exception:
                pass
            time.sleep(45.0)

    threading.Thread(target=_loop, name="tutor-supabase-outbox", daemon=True).start()


def log_chat_turn(
    *,
    student_name: str,
    concept_id: str,
    layer: str,
    age_group: str,
    trigger: str,
    user_message: str,
    assistant_reply: str,
    from_cache: bool,
    history_message_count: int = 0,
    model_id: str = "claude-sonnet-4-6",
) -> None:
    if _AUDIT_DISABLED:
        return
    sk = f"{student_name}::{concept_id}"
    ts = _utc_now_iso()
    try:
        with _lock:
            c = _connection()
            c.execute(
                """
                INSERT INTO tutor_chat_turns (
                    created_at, student_name, concept_id, session_key, layer, age_group,
                    trigger, user_message, assistant_reply, from_cache, model_id,
                    history_message_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ts,
                    student_name,
                    concept_id,
                    sk,
                    layer,
                    age_group,
                    trigger,
                    user_message,
                    assistant_reply,
                    1 if from_cache else 0,
                    model_id,
                    history_message_count,
                ),
            )
    except sqlite3.Error:
        return
    _sync_row_to_cloud(
        "tutor_chat_turns",
        {
            "created_at": ts,
            "student_name": student_name,
            "concept_id": concept_id,
            "session_key": sk,
            "layer": layer,
            "age_group": age_group,
            "tutor_trigger": trigger,
            "user_message": user_message,
            "assistant_reply": assistant_reply,
            "from_cache": bool(from_cache),
            "model_id": model_id,
            "history_message_count": history_message_count,
        },
    )


def log_evaluation(
    *,
    student_name: str,
    concept_id: str,
    layer: str,
    age_group: str,
    drawing_prompt: str,
    path_count: int,
    result: dict[str, Any],
    from_cache: bool,
    model_id: str = "claude-sonnet-4-6",
) -> None:
    if _AUDIT_DISABLED:
        return
    sk = f"{student_name}::{concept_id}"
    ts = _utc_now_iso()
    payload = json.dumps(result, ensure_ascii=False)
    try:
        with _lock:
            c = _connection()
            c.execute(
                """
                INSERT INTO tutor_evaluation_turns (
                    created_at, student_name, concept_id, session_key, layer, age_group,
                    drawing_prompt, path_count, result_json, from_cache, model_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ts,
                    student_name,
                    concept_id,
                    sk,
                    layer,
                    age_group,
                    drawing_prompt,
                    path_count,
                    payload,
                    1 if from_cache else 0,
                    model_id,
                ),
            )
    except sqlite3.Error:
        return
    _sync_row_to_cloud(
        "tutor_evaluation_turns",
        {
            "created_at": ts,
            "student_name": student_name,
            "concept_id": concept_id,
            "session_key": sk,
            "layer": layer,
            "age_group": age_group,
            "drawing_prompt": drawing_prompt,
            "path_count": path_count,
            "result_json": result,
            "from_cache": bool(from_cache),
            "model_id": model_id,
        },
    )


def log_session_event(*, student_name: str, event_type: str, detail: str | None = None) -> None:
    if _AUDIT_DISABLED:
        return
    ts = _utc_now_iso()
    try:
        with _lock:
            c = _connection()
            c.execute(
                """
                INSERT INTO tutor_session_events (created_at, event_type, student_name, detail)
                VALUES (?, ?, ?, ?)
                """,
                (ts, event_type, student_name, detail),
            )
    except sqlite3.Error:
        return
    _sync_row_to_cloud(
        "tutor_session_events",
        {
            "created_at": ts,
            "event_type": event_type,
            "student_name": student_name,
            "detail": detail,
        },
    )
