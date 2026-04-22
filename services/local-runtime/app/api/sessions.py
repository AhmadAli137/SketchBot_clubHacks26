"""
Classroom session API.

Endpoints used by both teacher (create / close / list) and student (validate / join / heartbeat).
Authentication is intentionally light for students: join code + display name only.
Teachers are identified by a Supabase JWT passed in the Authorization header.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services import session_service as svc

logger = logging.getLogger("sketchbot.sessions_api")

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ─── Request / response models ────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    classroom_name: str = Field(default="My Class", max_length=80)
    lesson_plan_id: str | None = None


class JoinSessionRequest(BaseModel):
    join_code: str = Field(..., min_length=1, max_length=10)
    student_name: str = Field(..., min_length=1, max_length=60)


class HeartbeatRequest(BaseModel):
    participant_id: str
    current_step: int = Field(default=0, ge=0)
    xp_earned: int = Field(default=0, ge=0)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _teacher_id_from_request(request: Request) -> str | None:
    """Extract Supabase user id from Authorization header JWT if present."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth.removeprefix("Bearer ").strip()
    # Parse the JWT payload without verification — teacher_id is informational only.
    # Security: session create/close is local-runtime-only (not exposed externally).
    try:
        import base64, json as _json
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = _json.loads(base64.urlsafe_b64decode(payload_b64))
        return payload.get("sub")
    except Exception:
        return None


# ─── Teacher routes ───────────────────────────────────────────────────────────

@router.post("/create")
async def create_session(req: CreateSessionRequest, request: Request) -> dict:
    teacher_id = _teacher_id_from_request(request)
    session = svc.create_session(
        classroom_name=req.classroom_name,
        teacher_id=teacher_id,
        lesson_plan_id=req.lesson_plan_id,
    )
    return {
        "ok": True,
        "session_id": session["id"],
        "join_code": session["join_code"],
        "classroom_name": session["classroom_name"],
        "created_at": session["created_at"],
    }


@router.post("/close/{join_code}")
async def close_session(join_code: str) -> dict:
    ok = svc.close_session(join_code)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.post("/lock/{join_code}")
async def lock_session(join_code: str) -> dict:
    """Block new students from joining (exam / eyes-up moment)."""
    session = svc.get_session(join_code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Stash locked flag in memory; Supabase doesn't need a separate status column for MVP
    from app.services import supabase_client as sb
    sb.patch_rows("classroom_sessions", {"join_code": f"eq.{join_code.upper()}"}, {"status": "locked"})
    svc._mem_sessions.get(join_code.upper(), {})["status"] = "locked"
    return {"ok": True}


@router.post("/unlock/{join_code}")
async def unlock_session(join_code: str) -> dict:
    """Re-open joins after a lock."""
    from app.services import supabase_client as sb
    sb.patch_rows("classroom_sessions", {"join_code": f"eq.{join_code.upper()}"}, {"status": "live"})
    svc._mem_sessions.get(join_code.upper(), {})["status"] = "live"
    return {"ok": True}


@router.get("/my-sessions")
async def my_sessions(request: Request) -> dict:
    teacher_id = _teacher_id_from_request(request)
    if not teacher_id:
        return {"sessions": []}
    sessions = svc.teacher_active_sessions(teacher_id)
    return {"sessions": sessions}


@router.get("/history")
async def session_history(request: Request) -> dict:
    teacher_id = _teacher_id_from_request(request)
    if not teacher_id:
        return {"sessions": []}
    sessions = svc.teacher_session_history(teacher_id)
    return {"sessions": sessions}


# ─── Shared routes ────────────────────────────────────────────────────────────

@router.get("/validate/{join_code}")
async def validate_session(join_code: str) -> dict:
    session = svc.get_session(join_code)  # only 'live' is joinable
    if not session:
        return {"valid": False}
    return {
        "valid": True,
        "classroom_name": session.get("classroom_name", "My Class"),
        "session_id": session.get("id"),
    }


@router.get("/participants/{join_code}")
async def list_participants(join_code: str) -> dict:
    session = svc.get_session(join_code, allow_locked=True)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    participants = svc.list_participants(join_code)
    return {"participants": participants, "count": len(participants)}


# ─── Student routes ───────────────────────────────────────────────────────────

@router.post("/join")
async def join_session(req: JoinSessionRequest) -> dict:
    result = svc.join_session(req.join_code, req.student_name)
    if not result:
        raise HTTPException(status_code=404, detail="Invalid or expired join code")
    return {"ok": True, **result}


@router.post("/heartbeat")
async def heartbeat(req: HeartbeatRequest) -> dict:
    svc.heartbeat(req.participant_id)
    svc.update_participant_step(req.participant_id, req.current_step, req.xp_earned)
    return {"ok": True}
