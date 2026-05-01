"""
WebSocket endpoint for the persistent TutorAgent (Plan B).

Protocol overview:
    Client connects to /ws/tutor (no auth header — WS can't easily set
    them). First message MUST be `hello` carrying the auth token plus
    identity fields. Server validates and either creates a fresh
    TutorAgent for that session_id or reattaches an existing one.

Auth note: WebSocket doesn't naturally accept an `Authorization` header
the way fetch() does, so the renderer puts the Supabase JWT in the
hello payload instead. We validate it by hand using the same supabase
client `auth.py` uses.
"""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.core.settings import settings
from app.services.agent_session_manager import agent_session_manager
from app.services.tutor_agent import (
    MSG_ERROR,
    MSG_HELLO,
    AgentIdentity,
)

logger = logging.getLogger("sketchbot.tutor.ws")

router = APIRouter(tags=["tutor-ws"])

# Hello timeout — if we don't get a valid hello within this window after
# accepting the connection, we bail. Defends against zombie/malicious
# connections that just sit there.
HELLO_TIMEOUT_SEC = 5


async def _validate_supabase_token(token: str) -> dict | None:
    """Returns {id, email} if the token is valid, else None."""
    if settings.skip_auth:
        return {"id": "dev-user", "email": "dev@local"}
    if not token:
        return None
    if not settings.supabase_url or not settings.supabase_service_role_key:
        # Auth required but not configured server-side. Treat as failure.
        return None
    try:
        from supabase import create_client
        client = create_client(
            settings.supabase_url, settings.supabase_service_role_key,
        )
        resp = client.auth.get_user(token)
        if not resp.user:
            return None
        return {"id": resp.user.id, "email": resp.user.email}
    except Exception:  # noqa: BLE001
        return None


@router.websocket("/ws/tutor")
async def tutor_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    agent = None

    try:
        # ── 1. Wait for hello (with timeout) ─────────────────────────────
        try:
            raw = await asyncio.wait_for(
                websocket.receive_text(),
                timeout=HELLO_TIMEOUT_SEC,
            )
        except asyncio.TimeoutError:
            await _send_error(websocket, "hello_timeout", "no hello in time")
            await websocket.close(code=4001)
            return

        try:
            hello = json.loads(raw)
        except json.JSONDecodeError:
            await _send_error(websocket, "bad_json", "first message must be JSON")
            await websocket.close(code=4002)
            return

        if hello.get("type") != MSG_HELLO:
            await _send_error(websocket, "expected_hello", f"got type={hello.get('type')!r}")
            await websocket.close(code=4003)
            return

        # ── 2. Auth ──────────────────────────────────────────────────────
        token = str(hello.get("token", ""))
        user = await _validate_supabase_token(token)
        if user is None:
            await _send_error(websocket, "auth_failed", "invalid token")
            await websocket.close(code=4401)
            return

        # ── 3. Identity ──────────────────────────────────────────────────
        session_id = str(hello.get("session_id", "")).strip()
        if not session_id:
            await _send_error(websocket, "missing_session_id", "session_id required")
            await websocket.close(code=4004)
            return

        identity = AgentIdentity(
            session_id=session_id,
            student_name=str(hello.get("student_name", "Student")),
            age_group=str(hello.get("age_group", "builder")),
            actor_role=str(hello.get("actor_role", "student")),
            concept_id=hello.get("concept_id"),
            layer=str(hello.get("layer", "intuitive")),
        )

        # ── 4. Get or create agent ───────────────────────────────────────
        try:
            agent, resumed = await agent_session_manager.get_or_create(identity)
        except RuntimeError as exc:
            await _send_error(websocket, "capacity", str(exc))
            await websocket.close(code=4503)
            return

        await agent.attach(websocket, resumed=resumed)

        # ── 5. Receive loop ──────────────────────────────────────────────
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    logger.warning("ws.bad_json session_id=%s", session_id)
                    continue

                if not isinstance(msg, dict):
                    continue

                await agent.handle_message(msg)

        except WebSocketDisconnect:
            logger.info("ws.disconnect session_id=%s", session_id)

    except Exception:  # noqa: BLE001
        logger.exception("ws.unexpected_error")
        try:
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        except Exception:  # noqa: BLE001
            pass

    finally:
        if agent is not None:
            await agent.detach()


async def _send_error(ws: WebSocket, code: str, message: str) -> None:
    try:
        await ws.send_text(json.dumps({"type": MSG_ERROR, "code": code, "message": message}))
    except Exception:  # noqa: BLE001
        pass
