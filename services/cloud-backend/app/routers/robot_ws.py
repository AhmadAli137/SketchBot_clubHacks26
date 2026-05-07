"""
WebSocket endpoint for the firmware-direct robot session (Phase 2c.2).

A factory-fresh robot connects to the user's local-runtime over LAN. Once
a user binds the bot to their account (Phase 2b) and provisions the
device with a cloud-issued JWT (Phase 2c.1), the firmware's network_hal
prefers the cloud /ws/robot endpoint and connects here directly — no
desktop app required.

Phase 2c.3 added the device hub: this endpoint no longer terminates
firmware messages, it forwards them through DeviceHub so /ws/control
controllers (desktop, mobile) see the same telemetry / heartbeats /
command_results in real time. Cloud is purely a switchboard — no
orchestration happens here.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

import jwt as _jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.settings import settings
from app.services import device_hub, device_tokens

logger = logging.getLogger("sketchbot.robot.ws")

router = APIRouter(tags=["robot-ws"])

HELLO_TIMEOUT_SEC = 5


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
    hub = None
    device_id: str | None = None
    serial: str = "?"

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

        device_id = device["id"]
        serial = device["serial"]

        # Hub is the rendezvous point with /ws/control subscribers. If the
        # firmware is reconnecting (e.g. after a reset) we may displace a
        # stale firmware WS; the hub picks up the new one.
        hub = await device_hub.get_or_create(
            device_id=device_id,
            serial=serial,
            user_id=device["user_id"],
        )
        old_ws = hub.firmware_ws
        if old_ws is not None and old_ws is not websocket:
            try:
                await old_ws.close(code=4409)
            except Exception:  # noqa: BLE001
                pass
        await hub.attach_firmware(websocket)
        _touch_last_seen(device_id)

        await websocket.send_text(json.dumps({
            "type": "hello_ack",
            "ok": True,
            "session_id": f"cloud-robot-{device_id}",
            "server_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }))
        logger.info(
            "robot ws: %s connected (user=%s)", serial, device["user_id"],
        )

        # ── Steady state: forward firmware messages to controllers ────────
        # Heartbeats also bump last_seen_at so the admin web's "last seen"
        # timestamp reflects bot liveness without a separate ping cycle.
        while True:
            text = await websocket.receive_text()
            try:
                msg = json.loads(text)
            except json.JSONDecodeError:
                continue
            kind = msg.get("type")
            if kind == "heartbeat":
                _touch_last_seen(device_id)
            # Forward everything (telemetry, heartbeat, command_result, …)
            # so the controller sees the same firmware-side world the
            # local-runtime would see.
            await hub.from_firmware(text)

    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("robot ws: unexpected error")
    finally:
        if hub is not None and device_id is not None:
            await hub.detach_firmware(websocket)
            await device_hub.maybe_drop(device_id)
            logger.info("robot ws: %s disconnected", serial)
