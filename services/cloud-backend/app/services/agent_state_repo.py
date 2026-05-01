"""
agent_state_repo — Supabase-backed persistence for TutorAgent state.

Opt-in via TUTOR_PERSIST_ENABLED=true. Schema lives in
scripts/supabase_tutor_agent_state.sql.

What survives a deploy when this is enabled:
  - identity (student_name, age_group, concept_id, layer)
  - hypothesis (the agent's rolling read of the session)
  - event_log (recent events the agent reasoned over)
  - last_speak_ts / last_think_at / last_next_check_sec (cadence anchors)

Saves are best-effort: a Supabase outage must NOT block reasoning. All
errors are logged and swallowed.

The Supabase Python SDK is sync-only, so we offload to
asyncio.to_thread to keep the event loop free.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from app.auth import _supabase_client
from app.core.settings import settings

logger = logging.getLogger("sketchbot.tutor.persist")

TABLE = "tutor_agent_state"


def is_enabled() -> bool:
    """True when persistence is opt-in and the Supabase client is configured."""
    if not settings.tutor_persist_enabled:
        return False
    return _supabase_client() is not None


async def save(agent: Any) -> None:
    """Upsert the agent's current state. Best-effort: errors are logged
    and swallowed so a Supabase blip never breaks reasoning."""
    if not is_enabled():
        return

    client = _supabase_client()
    if client is None:
        return

    # Snapshot fields synchronously (cheap) before hopping threads.
    payload = _snapshot(agent)

    def _upsert() -> None:
        client.table(TABLE).upsert(payload, on_conflict="session_id").execute()

    try:
        await asyncio.to_thread(_upsert)
        logger.debug(
            "persist.save session_id=%s hypothesis_len=%d events=%d",
            agent.id, len(payload.get("hypothesis") or ""),
            len(payload.get("event_log") or []),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "persist.save_failed session_id=%s err=%s",
            agent.id, exc,
        )


async def load(session_id: str) -> dict | None:
    """Return the persisted state for session_id, or None if missing /
    disabled / errored."""
    if not is_enabled():
        return None

    client = _supabase_client()
    if client is None:
        return None

    def _select() -> Any:
        return (
            client.table(TABLE)
            .select("*")
            .eq("session_id", session_id)
            .limit(1)
            .execute()
        )

    try:
        result = await asyncio.to_thread(_select)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "persist.load_failed session_id=%s err=%s",
            session_id, exc,
        )
        return None

    rows = getattr(result, "data", None) or []
    if not rows:
        return None
    row = rows[0]

    # Don't restore expired rows. The cleanup function purges them on a
    # cron, but we shouldn't trust them to be gone yet.
    expires_at = row.get("expires_at")
    if expires_at and _expires_in_past(expires_at):
        logger.info("persist.load_expired session_id=%s", session_id)
        return None

    logger.info(
        "persist.load_hit session_id=%s hypothesis_len=%d events=%d",
        session_id, len(row.get("hypothesis") or ""),
        len(row.get("event_log") or []),
    )
    return row


async def delete(session_id: str) -> None:
    """Drop the row for a session. Used when a user explicitly ends a
    session — we don't want to resurrect it on next login."""
    if not is_enabled():
        return

    client = _supabase_client()
    if client is None:
        return

    def _delete() -> None:
        client.table(TABLE).delete().eq("session_id", session_id).execute()

    try:
        await asyncio.to_thread(_delete)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "persist.delete_failed session_id=%s err=%s",
            session_id, exc,
        )


# ─── Helpers ───────────────────────────────────────────────────────────────

def _snapshot(agent: Any) -> dict[str, Any]:
    """Build the row payload from a TutorAgent. Kept defensive — any
    field that's None or wrong shape becomes a harmless default."""
    identity = {
        "session_id": agent.identity.session_id,
        "student_name": agent.identity.student_name,
        "age_group": agent.identity.age_group,
        "actor_role": agent.identity.actor_role,
        "concept_id": agent.identity.concept_id,
        "layer": agent.identity.layer,
    }

    # Serialise event log to plain JSON-compatible dicts.
    event_log: list[dict] = []
    for ev in list(agent.event_log)[-20:]:  # cap at last 20 to keep rows small
        event_log.append({
            "kind": ev.kind,
            "payload": ev.payload,
            "ts": ev.ts,
        })

    return {
        "session_id": agent.id,
        "identity": identity,
        "hypothesis": agent.hypothesis,
        "event_log": event_log,
        "last_speak_ts": agent.last_speak_ts or None,
        "last_think_at": agent.last_think_at or None,
        "last_next_check_sec": agent.last_next_check_sec,
        # Refresh expiry on every save so active sessions stay alive.
        "expires_at": _iso(time.time() + 24 * 3600),
    }


def _iso(epoch: float) -> str:
    """Postgres-compatible ISO8601 timestamp."""
    import datetime as _dt
    return _dt.datetime.fromtimestamp(epoch, tz=_dt.timezone.utc).isoformat()


def _expires_in_past(value: Any) -> bool:
    """Best-effort check if an ISO timestamp string is in the past."""
    if not isinstance(value, str):
        return False
    try:
        import datetime as _dt
        ts = _dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return ts < _dt.datetime.now(tz=ts.tzinfo or _dt.timezone.utc)
    except Exception:  # noqa: BLE001
        return False
