"""
WebSocket endpoint for the firmware-direct robot session (Phase 2c.2).

A factory-fresh robot connects to the user's local-runtime over LAN. Once
a user binds the bot to their account (Phase 2b) and provisions the
device with a cloud-issued JWT (Phase 2c.1), the firmware's network_hal
prefers the cloud /ws/robot endpoint and connects here directly — no
desktop app required.

This commit establishes:
  - the WS endpoint
  - JWT-based auth in the hello (verify signature, JTI match against the
    live devices row, refusing revoked tokens)
  - a per-device session mailbox so future cloud senders can push
    commands back to the firmware
  - last_seen_at touched on every successful connect

It deliberately does NOT yet wire up Spark narration — that comes in
Phase 2c.3 alongside the companion-phone WS stream.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

import jwt as _jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.settings import settings
from app.services import device_tokens

logger = logging.getLogger("sketchbot.robot.ws")

router = APIRouter(tags=["robot-ws"])

HELLO_TIMEOUT_SEC = 5


# ─── Per-user robot session registry ─────────────────────────────────────────
# Keyed by device id (UUID string). One robot can be live per device. Future
# senders (Phase 2c.3 narrator, companion WS stream) read this to find the
# right WS to push to.

class RobotSession:
    __slots__ = ("device_id", "serial", "user_id", "websocket", "connected_at")

    def __init__(self, device_id: str, serial: str, user_id: str, websocket: WebSocket):
        self.device_id = device_id
        self.serial = serial
        self.user_id = user_id
        self.websocket = websocket
        self.connected_at = time.time()


_sessions: dict[str, RobotSession] = {}


def get_session(device_id: str) -> RobotSession | None:
    return _sessions.get(device_id)


def sessions_for_user(user_id: str) -> list[RobotSession]:
    return [s for s in _sessions.values() if s.user_id == user_id]


# ─── Auth + DB helpers ───────────────────────────────────────────────────────

def _supabase():
    """Late import so this router still loads when supabase isn't configured."""
    from app.auth import _supabase_client
    return _supabase_client()


async def _validate_device_token(token: str) -> dict | None:
    """Returns the devices row (as dict) iff the JWT is valid AND its JTI
    still matches the live row AND the row hasn't been revoked. None on
    any failure. Logs the reason for diagnostics; the WS close-code is
    intentionally generic so a probing attacker can't distinguish
    "signature bad" from "JTI mismatch".
    """
    if not token:
        return None

    try:
        claims = device_tokens.verify(token)
    except _jwt.PyJWTError as exc:
        logger.info("robot ws: token verify failed: %s", exc)
        return None

    device_id = claims.get("sub")
    jti = claims.get("jti")
    if not device_id or not jti:
        return None

    if settings.skip_auth:
        # Dev — accept any signed token without DB lookup.
        return {
            "id": device_id,
            "serial": claims.get("serial", "SKETCH-DEV0-DEV0"),
            "user_id": claims.get("user_id", "dev-user"),
            "token_jti": jti,
            "token_revoked_at": None,
        }

    client = _supabase()
    if client is None:
        logger.warning("robot ws: supabase not configured")
        return None

    try:
        resp = (
            client.table("devices")
            .select("id, serial, name, user_id, token_jti, token_revoked_at")
            .eq("id", device_id)
            .maybe_single()
            .execute()
        )
    except Exception:  # noqa: BLE001
        logger.exception("robot ws: device lookup failed")
        return None

    if resp is None or not resp.data:
        return None
    row = resp.data
    if row.get("token_revoked_at"):
        logger.info("robot ws: token for device %s is revoked", device_id)
        return None
    if str(row.get("token_jti")) != str(jti):
        logger.info("robot ws: jti mismatch for device %s", device_id)
        return None
    return row


def _touch_last_seen(device_id: str) -> None:
    """Best-effort last_seen_at update. Failure is non-fatal — if the DB is
    transiently unhappy we still want to keep serving the live WS.
    """
    if settings.skip_auth:
        return
    client = _supabase()
    if client is None:
        return
    try:
        client.table("devices").update(
            {"last_seen_at": "now()"}
        ).eq("id", device_id).execute()
    except Exception:  # noqa: BLE001
        logger.exception("robot ws: last_seen update failed")


# ─── Endpoint ────────────────────────────────────────────────────────────────

@router.websocket("/ws/robot")
async def robot_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    session: RobotSession | None = None

    try:
        # First message MUST be hello with the device JWT.
        try:
            raw = await asyncio.wait_for(
                websocket.receive_text(), timeout=HELLO_TIMEOUT_SEC
            )
        except asyncio.TimeoutError:
            logger.info("robot ws: hello timeout")
            await websocket.close(code=4001)
            return

        try:
            hello = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.close(code=4002)
            return

        if hello.get("type") != "hello":
            await websocket.close(code=4002)
            return

        token = hello.get("auth_token") or ""
        device = await _validate_device_token(token)
        if device is None:
            # 4401 — auth failure (custom; WS draft uses 4xxx for app errors).
            await websocket.close(code=4401)
            return

        session = RobotSession(
            device_id=device["id"],
            serial=device["serial"],
            user_id=device["user_id"],
            websocket=websocket,
        )
        # Replace any existing session for this device — a fresh connection
        # always wins (e.g. firmware reset) over a stale one we couldn't
        # detect a TCP close on.
        old = _sessions.pop(session.device_id, None)
        if old is not None and old.websocket is not websocket:
            try:
                await old.websocket.close(code=4409)
            except Exception:  # noqa: BLE001
                pass
        _sessions[session.device_id] = session
        _touch_last_seen(session.device_id)

        await websocket.send_text(json.dumps({
            "type": "hello_ack",
            "ok": True,
            "session_id": f"cloud-robot-{session.device_id}",
            "server_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }))
        logger.info(
            "robot ws: %s connected (user=%s)",
            session.serial, session.user_id,
        )

        # ── Steady state: receive telemetry/heartbeat/command_result ──────
        # Phase 2c.3 will subscribe Spark + the companion stream to this
        # loop. For now we just log so the path is verifiable end-to-end.
        while True:
            text = await websocket.receive_text()
            try:
                msg = json.loads(text)
            except json.JSONDecodeError:
                continue
            kind = msg.get("type")
            if kind == "heartbeat":
                _touch_last_seen(session.device_id)
            elif kind in ("telemetry", "command_result"):
                logger.debug("robot ws %s: %s", session.serial, kind)
            else:
                logger.debug("robot ws %s: unknown msg %s", session.serial, kind)

    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("robot ws: unexpected error")
    finally:
        if session is not None:
            current = _sessions.get(session.device_id)
            if current is session:
                _sessions.pop(session.device_id, None)
            logger.info("robot ws: %s disconnected", session.serial)
