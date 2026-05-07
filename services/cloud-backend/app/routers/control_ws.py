"""
Control WebSocket — desktop / mobile / any authed client subscribes here
to drive a specific device through the cloud relay (Phase 2c.3).

Why this exists: post-provisioning, the firmware connects only to
/ws/robot. Orchestrators (the desktop's program executor, the mobile
companion's voice loop) live on the user's devices, not on the cloud.
This endpoint multiplexes them onto the same firmware WS via the
DeviceHub.

Auth: same Supabase JWT that the rest of the API uses, passed in the
hello payload (WS doesn't get an Authorization header from browsers).
The controller can only subscribe to devices the auth user owns —
ownership is checked against public.devices.user_id.

Protocol:
    Client → Server hello:
        { "type": "hello", "auth_token": "<supabase jwt>",
          "device_id": "<uuid>" }      // OR "serial": "SKETCH-…"

    Server → Client immediately after hello:
        { "type": "hello_ack", "ok": true, "session_id": "..." }
        { "type": "device_status", "serial": "...", "online": true|false }

    Client → Server during session:
        { "type": "command", "name": "...", "args": {...},
          "command_id": "..." }   // forwarded verbatim to firmware

    Server → Client during session:
        // Verbatim from firmware: telemetry, heartbeat, command_result
        { "type": "device_status", "online": ... }   // hub state changes
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.settings import settings
from app.services import device_hub

logger = logging.getLogger("sketchbot.control.ws")

router = APIRouter(tags=["control-ws"])

HELLO_TIMEOUT_SEC = 5


# ─── Auth ────────────────────────────────────────────────────────────────────

async def _validate_supabase_token(token: str) -> dict | None:
    """Returns {id, email} on success, None on failure. Mirrors the
    WS-side validator in tutor_ws.py so we don't depend on FastAPI
    request scope (which doesn't exist for WS upgrades).
    """
    if settings.skip_auth:
        return {"id": "dev-user", "email": "dev@local"}
    if not token:
        return None
    if not settings.supabase_url or not settings.supabase_service_role_key:
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


def _supabase():
    from app.auth import _supabase_client
    return _supabase_client()


def _lookup_device(*, device_id: str | None, serial: str | None) -> dict | None:
    """Find a device by id or serial. Returns the row including user_id
    so the caller can check ownership.
    """
    if settings.skip_auth:
        return {
            "id": device_id or "dev-device",
            "serial": serial or "SKETCH-DEV0-DEV0",
            "user_id": "dev-user",
        }
    client = _supabase()
    if client is None:
        return None
    try:
        q = client.table("devices").select("id, serial, user_id")
        if device_id:
            q = q.eq("id", device_id)
        elif serial:
            q = q.eq("serial", serial.upper())
        else:
            return None
        resp = q.maybe_single().execute()
    except Exception:  # noqa: BLE001
        logger.exception("control ws: device lookup failed")
        return None
    if resp is None or not resp.data:
        return None
    return resp.data


# ─── Endpoint ────────────────────────────────────────────────────────────────

@router.websocket("/ws/control")
async def control_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    hub = None
    device_id_for_cleanup: str | None = None

    try:
        # ── 1. Hello (with timeout) ──────────────────────────────────────
        try:
            raw = await asyncio.wait_for(
                websocket.receive_text(), timeout=HELLO_TIMEOUT_SEC
            )
        except asyncio.TimeoutError:
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

        # ── 2. Auth: validate Supabase token, then check device ownership ─
        user = await _validate_supabase_token(hello.get("auth_token") or "")
        if user is None:
            await websocket.close(code=4401)
            return

        device = _lookup_device(
            device_id=hello.get("device_id"),
            serial=hello.get("serial"),
        )
        if device is None:
            # Device doesn't exist OR caller can't even get past lookup —
            # respond as if it's not theirs so we don't leak existence.
            await websocket.close(code=4404)
            return
        if device["user_id"] != user["id"]:
            # Same close code as not-found so a probing attacker can't
            # tell which devices belong to other accounts.
            await websocket.close(code=4404)
            return

        device_id_for_cleanup = device["id"]
        hub = await device_hub.get_or_create(
            device_id=device["id"],
            serial=device["serial"],
            user_id=user["id"],
        )

        await websocket.send_text(json.dumps({
            "type": "hello_ack",
            "ok": True,
            "session_id": f"cloud-control-{device['id']}-{int(time.time())}",
            "server_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }))

        await hub.add_controller(websocket)
        logger.info(
            "control ws: user=%s subscribed to %s",
            user["id"], device["serial"],
        )

        # ── 3. Steady state: forward controller → firmware ───────────────
        while True:
            text = await websocket.receive_text()
            # Light-touch validation: only forward objects with a "type".
            # We don't parse beyond that — the firmware (or local-runtime
            # equivalent) is the source of truth for command shapes.
            try:
                msg = json.loads(text)
            except json.JSONDecodeError:
                continue
            if not isinstance(msg, dict) or "type" not in msg:
                continue

            ok = await hub.from_controller(text)
            if not ok:
                # Firmware is offline — the controller may want to retry
                # or surface "robot is sleeping". We don't queue commands
                # here because stale commands ("draw" from 5 min ago) are
                # confusing when the bot wakes.
                await websocket.send_text(json.dumps({
                    "type": "command_result",
                    "command_id": msg.get("command_id"),
                    "ok": False,
                    "message": "robot offline",
                }))

    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("control ws: unexpected error")
    finally:
        if hub is not None:
            await hub.remove_controller(websocket)
            if device_id_for_cleanup is not None:
                await device_hub.maybe_drop(device_id_for_cleanup)
            logger.info("control ws: subscriber disconnected")
