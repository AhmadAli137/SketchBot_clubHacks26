"""
Device hub — in-process registry that fans messages between one
firmware WebSocket and N controller WebSockets per device.

Architecture (Phase 2c.3):

    Firmware ── /ws/robot ──▶ DeviceHub ◀── /ws/control ── Desktop
                                  ▲
                                  └──────── /ws/control ── Mobile

The hub is a pure switchboard — no orchestration, no command translation.
Commands from any controller are forwarded verbatim to the firmware.
Telemetry / heartbeats / command_results from the firmware are broadcast
to every subscribed controller.

Concurrency model: last-writer-wins. If desktop and mobile both send
commands at the same instant, the firmware sees them in the order they
land at the cloud. We don't add a lock today; if it bites in practice
we'll add a "session leader" handshake later.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable

from fastapi import WebSocket

logger = logging.getLogger("sketchbot.device.hub")


# Send-callable signature used by the hub when fanning a message out.
# Each WebSocket-owning router supplies its own sender so we don't have
# to import FastAPI types here beyond the bare WebSocket.
Sender = Callable[[str], Awaitable[None]]


class DeviceHub:
    """Per-device routing state. Created lazily when either the firmware
    connects or the first controller subscribes — whichever happens
    first. Lives in memory; on cloud-backend restart all sessions drop
    and clients reconnect.
    """

    __slots__ = (
        "device_id", "serial", "user_id",
        "firmware_ws", "controllers", "_lock",
    )

    def __init__(self, device_id: str, serial: str, user_id: str):
        self.device_id = device_id
        self.serial = serial
        self.user_id = user_id
        self.firmware_ws: WebSocket | None = None
        # Multiple controllers can subscribe (e.g. desktop + mobile both
        # observing). They each get every message the firmware sends.
        self.controllers: set[WebSocket] = set()
        # Coarse lock around membership changes to keep set mutations
        # atomic with the broadcast iteration.
        self._lock = asyncio.Lock()

    # ── Firmware side ────────────────────────────────────────────────────
    async def attach_firmware(self, ws: WebSocket) -> None:
        async with self._lock:
            self.firmware_ws = ws
        # Tell every connected controller the bot is online so its UI can
        # flip from "sleeping" to "ready". Done outside the lock to avoid
        # holding it across awaits to other clients' send buffers.
        await self._broadcast_status(online=True)

    async def detach_firmware(self, ws: WebSocket) -> None:
        async with self._lock:
            if self.firmware_ws is ws:
                self.firmware_ws = None
        await self._broadcast_status(online=False)

    async def from_firmware(self, raw: str) -> None:
        """Fan a message from the firmware out to every subscribed
        controller. Stale connections are dropped silently — the
        controller's own loop will notice the close on its next read.
        """
        dead: list[WebSocket] = []
        for ws in list(self.controllers):
            try:
                await ws.send_text(raw)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self.controllers.discard(ws)

    # ── Controller side ─────────────────────────────────────────────────
    async def add_controller(self, ws: WebSocket) -> None:
        async with self._lock:
            self.controllers.add(ws)
        # Surface the current firmware state immediately so the controller
        # doesn't have to wait for the next heartbeat to know whether the
        # robot is alive. This is the only message the hub generates on
        # its own — everything else is verbatim forwarding.
        await ws.send_text(
            _status_message(self.serial, self.firmware_ws is not None)
        )

    async def remove_controller(self, ws: WebSocket) -> None:
        async with self._lock:
            self.controllers.discard(ws)

    async def from_controller(self, raw: str) -> bool:
        """Forward a controller-originated message to the firmware.
        Returns False if the firmware isn't connected — caller should
        respond to the controller with an offline-error message.
        """
        ws = self.firmware_ws
        if ws is None:
            return False
        try:
            await ws.send_text(raw)
            return True
        except Exception:  # noqa: BLE001
            logger.exception("hub %s: forward to firmware failed", self.serial)
            return False

    # ── Helpers ─────────────────────────────────────────────────────────
    async def _broadcast_status(self, online: bool) -> None:
        msg = _status_message(self.serial, online)
        dead: list[WebSocket] = []
        for ws in list(self.controllers):
            try:
                await ws.send_text(msg)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self.controllers.discard(ws)

    def is_idle(self) -> bool:
        """True iff nothing is using this hub (no firmware, no controllers)."""
        return self.firmware_ws is None and not self.controllers


def _status_message(serial: str, online: bool) -> str:
    # Hub-generated control message. The firmware never emits this shape,
    # so controllers can distinguish hub status updates from firmware
    # passthrough by the type prefix.
    import json
    return json.dumps({
        "type": "device_status",
        "serial": serial,
        "online": online,
    })


# ─── Module-level registry ───────────────────────────────────────────────────
# Keyed by device_id (UUID string). Both /ws/robot and /ws/control read and
# write this; the hub's internal lock guards membership.

_hubs: dict[str, DeviceHub] = {}
_registry_lock = asyncio.Lock()


async def get_or_create(device_id: str, serial: str, user_id: str) -> DeviceHub:
    """Return the hub for `device_id`, creating it if absent. Subsequent
    callers get the same instance — that's how firmware and controllers
    rendezvous without coordinating their connection order.
    """
    async with _registry_lock:
        hub = _hubs.get(device_id)
        if hub is None:
            hub = DeviceHub(device_id=device_id, serial=serial, user_id=user_id)
            _hubs[device_id] = hub
        return hub


async def get(device_id: str) -> DeviceHub | None:
    async with _registry_lock:
        return _hubs.get(device_id)


async def maybe_drop(device_id: str) -> None:
    """Garbage-collect an idle hub. Called when a side disconnects so we
    don't keep empty entries around forever in the registry.
    """
    async with _registry_lock:
        hub = _hubs.get(device_id)
        if hub is not None and hub.is_idle():
            _hubs.pop(device_id, None)


def stats() -> dict[str, int]:
    """Diagnostic counts. Cheap; safe to expose via health endpoint."""
    return {
        "hubs": len(_hubs),
        "controllers": sum(len(h.controllers) for h in _hubs.values()),
        "firmware_connected": sum(1 for h in _hubs.values() if h.firmware_ws is not None),
    }
