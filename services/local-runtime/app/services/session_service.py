"""
Classroom session state — Supabase-backed with in-memory fallback.

All public functions work without Supabase configured; sessions are held in
_mem_sessions / _mem_participants for the lifetime of the server process.
When Supabase IS configured, operations are mirrored to the DB.
"""

from __future__ import annotations

import logging
import random
import string
import threading
from datetime import datetime, timezone
from typing import Any

from app.services import supabase_client as sb

logger = logging.getLogger("sketchbot.sessions")

_lock = threading.Lock()

# In-memory fallback stores
_mem_sessions: dict[str, dict[str, Any]] = {}       # join_code → session
_mem_participants: dict[str, dict[str, Any]] = {}   # participant_id → participant


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_code(length: int = 6) -> str:
    chars = string.ascii_uppercase + string.digits
    while True:
        code = "".join(random.choices(chars, k=length))
        if code not in _mem_sessions:
            return code


# ─── Session CRUD ─────────────────────────────────────────────────────────────

def create_session(
    classroom_name: str = "My Class",
    teacher_id: str | None = None,
    lesson_plan_id: str | None = None,
) -> dict[str, Any]:
    with _lock:
        code = _generate_code()
        session: dict[str, Any] = {
            "join_code": code,
            "classroom_name": classroom_name,
            "teacher_id": teacher_id,
            "lesson_plan_id": lesson_plan_id,
            "status": "live",
            "created_at": _now_iso(),
            "closed_at": None,
        }

        # Try Supabase first to get server-generated id
        row = sb.push_row("classroom_sessions", session)
        if row and row.get("id"):
            session["id"] = row["id"]
        else:
            import uuid
            session["id"] = str(uuid.uuid4())

        _mem_sessions[code] = session
        return session


def get_session(join_code: str, allow_locked: bool = False) -> dict[str, Any] | None:
    """Return the session if it's live (or locked when allow_locked=True)."""
    code = join_code.strip().upper()
    valid_statuses = {"live", "locked"} if allow_locked else {"live"}

    # Check Supabase for live sessions (locked sessions stay in memory only for MVP)
    rows = sb.get_rows("classroom_sessions", {"join_code": f"eq.{code}", "status": "eq.live"})
    if rows:
        session = rows[0]
        with _lock:
            _mem_sessions[code] = session
        return session

    # Fallback to memory
    with _lock:
        session = _mem_sessions.get(code)
        if session and session.get("status") in valid_statuses:
            return session
    return None


def join_session(
    join_code: str,
    student_name: str,
) -> dict[str, Any] | None:
    session = get_session(join_code)  # only 'live' — locked blocks new joins
    if not session:
        return None

    import uuid
    participant: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "session_id": session["id"],
        "join_code": join_code.upper(),
        "student_name": student_name.strip(),
        "joined_at": _now_iso(),
        "last_heartbeat_at": _now_iso(),
        "current_step": 0,
        "xp_earned": 0,
        "status": "active",
    }

    # Try Supabase (omit synthetic join_code field)
    sb_row = {k: v for k, v in participant.items() if k != "join_code"}
    row = sb.push_row("session_participants", sb_row)
    if row and row.get("id"):
        participant["id"] = row["id"]

    with _lock:
        _mem_participants[participant["id"]] = participant

    return {
        "participant_id": participant["id"],
        "session_id": session["id"],
        "join_code": join_code.upper(),
        "classroom_name": session.get("classroom_name", "My Class"),
        "student_name": student_name.strip(),
    }


def list_participants(join_code: str) -> list[dict[str, Any]]:
    session = get_session(join_code, allow_locked=True)
    if not session:
        return []

    session_id = session.get("id")

    rows = sb.get_rows(
        "session_participants",
        {"session_id": f"eq.{session_id}", "status": "eq.active"},
    )
    if rows is not None:
        return rows

    with _lock:
        return [
            p for p in _mem_participants.values()
            if p.get("session_id") == session_id and p.get("status") == "active"
        ]


def heartbeat(participant_id: str) -> bool:
    now = _now_iso()

    patched = sb.patch_rows(
        "session_participants",
        {"id": f"eq.{participant_id}"},
        {"last_heartbeat_at": now, "status": "active"},
    )

    with _lock:
        if participant_id in _mem_participants:
            _mem_participants[participant_id]["last_heartbeat_at"] = now
            _mem_participants[participant_id]["status"] = "active"
            return True
    return patched


def update_participant_step(participant_id: str, step: int, xp: int) -> bool:
    sb.patch_rows(
        "session_participants",
        {"id": f"eq.{participant_id}"},
        {"current_step": step, "xp_earned": xp},
    )
    with _lock:
        if participant_id in _mem_participants:
            _mem_participants[participant_id]["current_step"] = step
            _mem_participants[participant_id]["xp_earned"] = xp
            return True
    return False


def close_session(join_code: str) -> bool:
    code = join_code.strip().upper()
    now = _now_iso()

    sb.patch_rows(
        "classroom_sessions",
        {"join_code": f"eq.{code}"},
        {"status": "closed", "closed_at": now},
    )

    # Snapshot session under lock, then aggregate outside it to avoid re-entrant deadlock
    with _lock:
        session = _mem_sessions.get(code)
        if not session:
            return False
        session["status"] = "closed"
        session["closed_at"] = now
        session_snapshot = dict(session)

    _aggregate_session(session_snapshot)
    return True


def _aggregate_session(session: dict) -> None:
    """Commit each participant's final stats to student_progress (called outside _lock)."""
    session_id = session.get("id")

    with _lock:
        participants = list(_mem_participants.values())

    active = [p for p in participants if p.get("session_id") == session_id]
    for p in active:
        sb.push_row(
            "student_progress",
            {
                "session_id": session_id,
                "student_name": p.get("student_name", ""),
                "xp_earned": p.get("xp_earned", 0),
                "steps_completed": p.get("current_step", 0),
                "drawings_count": 0,
            },
        )
        with _lock:
            mem_p = _mem_participants.get(p["id"])
            if mem_p:
                mem_p["status"] = "left"


def teacher_active_sessions(teacher_id: str) -> list[dict[str, Any]]:
    rows = sb.get_rows(
        "classroom_sessions",
        {"teacher_id": f"eq.{teacher_id}", "status": "eq.live"},
    )
    if rows is not None:
        return rows

    with _lock:
        return [
            s for s in _mem_sessions.values()
            if s.get("teacher_id") == teacher_id and s.get("status") == "live"
        ]
