from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import Any

from fastapi import WebSocket

from app.models.command import (
    RobotCommandResultMessage,
    RobotFaultMessage,
    RobotHeartbeatMessage,
    RobotHelloMessage,
    RobotLogMessage,
    RobotTelemetryMessage,
)
from app.services.state_manager import state_manager


class RobotWebSocketService:
    def __init__(self) -> None:
        self.websocket: WebSocket | None = None
        self.robot_id: str | None = None
        self.last_heartbeat_at: float | None = None
        # Per-command-id futures so concurrent commands (e.g. wizard
        # opening + calibration hook auto-refresh) don't clobber each
        # other's result.
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.websocket = websocket

    async def disconnect(self) -> None:
        self.websocket = None
        self.robot_id = None
        self.last_heartbeat_at = None
        # Cancel any waiters blocked on a command — the bot just went
        # away, so their results will never arrive.
        for cmd_id, future in list(self._pending.items()):
            if not future.done():
                future.set_result({
                    'ok': False,
                    'command_id': cmd_id,
                    'message': 'robot disconnected',
                })
        self._pending.clear()
        state = state_manager.state
        state.robot_connected = False
        state.robot_status = 'disconnected'
        state.robot_serial = None
        state.active_controller = None
        state_manager.add_event('Robot websocket disconnected')

    async def handle_message(self, raw: str) -> None:
        payload = json.loads(raw)
        message_type = payload.get('type')

        if message_type == 'hello':
            msg = RobotHelloMessage(**payload)
            self.robot_id = msg.robot_id
            state = state_manager.state
            state.robot_connected = True
            state.robot_status = 'ready'
            state.robot_serial = msg.robot_id
            state.operator.connection_mode = 'real'
            state_manager.add_event(f'Robot connected: {msg.robot_id} ({msg.board} {msg.firmware_version})')
            await self.send({
                'type': 'hello_ack',
                'ok': True,
                'session_id': f'robot-session-{msg.robot_id}',
                'server_time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            })
            return

        if message_type == 'heartbeat':
            msg = RobotHeartbeatMessage(**payload)
            self.last_heartbeat_at = time.time()
            state = state_manager.state
            state.robot_connected = True
            if state.robot_status == 'disconnected':
                state.robot_status = 'ready'
            # Surface the firmware's arbitration result to the desktop UI
            # so the kid can see whether they're driving or another
            # session has taken over (Phase 2c.5).
            if msg.active_controller is not None:
                state.active_controller = msg.active_controller
            return

        # The firmware may also broadcast controller_status events when
        # the active controller flips (rather than waiting for the next
        # heartbeat). Treat it as a fast-path heartbeat for that one
        # field — same data, lower lag.
        if message_type == 'controller_status':
            state = state_manager.state
            active = payload.get('active')
            if isinstance(active, str):
                state.active_controller = active
            return

        if message_type == 'telemetry':
            msg = RobotTelemetryMessage(**payload)
            state = state_manager.state
            if msg.x_mm is not None:
                state.robot_pose.x_mm = msg.x_mm
            if msg.y_mm is not None:
                state.robot_pose.y_mm = msg.y_mm
            if msg.heading_deg is not None:
                state.robot_pose.heading_deg = msg.heading_deg
            if msg.pen_down is not None:
                state.robot_pose.pen_down = msg.pen_down
            if msg.homed is not None:
                state.robot.is_homed = msg.homed
            if msg.moving is not None:
                state.robot.motion_state = 'active' if msg.moving else 'idle'
            if msg.distance_cm is not None:
                # Firmware uses -1 as the "no echo" sentinel; expose that
                # as None to API consumers so a UI gauge can show "—"
                # rather than misreading a near-zero distance.
                state.robot.last_distance_cm = (
                    msg.distance_cm if msg.distance_cm >= 0 else None
                )
            if msg.fault:
                state.robot.fault.code = msg.fault.get('code')
                state.robot.fault.message = msg.fault.get('message')
            state.robot_connected = True
            state.robot_status = 'moving' if msg.moving else 'ready'
            state_manager._normalize_state()
            state_manager._refresh_operator_summary()
            return

        if message_type == 'command_result':
            msg = RobotCommandResultMessage(**payload)
            state = state_manager.state
            state.robot.active_command_id = msg.command_id
            state.robot_status = 'ready' if msg.ok else 'fault'
            state_manager.add_event(msg.message or f'Command result: {msg.command_id} ok={msg.ok}')
            # Resolve the matching pending future. Results without a
            # registered waiter (e.g. fire-and-forget commands) are
            # dropped silently — state events already capture them.
            future = self._pending.get(msg.command_id)
            if future is not None and not future.done():
                future.set_result({
                    'ok': msg.ok,
                    'command_id': msg.command_id,
                    'message': msg.message,
                })
            return

        if message_type == 'fault':
            msg = RobotFaultMessage(**payload)
            state = state_manager.state
            state.robot_status = 'fault'
            state.robot.fault.code = msg.code
            state.robot.fault.message = msg.message
            state_manager.add_event(f'Robot fault: {msg.code} {msg.message}')
            return

        if message_type == 'log':
            msg = RobotLogMessage(**payload)
            state_manager.add_event(f'Robot log [{msg.level}]: {msg.message}')
            return

    async def wait_for_command_result(
        self,
        command_id: str,
        timeout: float = 30.0,
    ) -> dict[str, Any]:
        """Block until the robot acknowledges the given command_id or
        timeout expires. Result is keyed by id, so concurrent commands
        don't steal each other's reply."""
        future = self._pending.get(command_id)
        if future is None:
            # No registered waiter — either send_command failed to
            # register one, or the result already arrived and was
            # discarded. Either way there's nothing to wait on.
            return {
                'ok': False,
                'command_id': command_id,
                'message': f'no pending command {command_id}',
            }
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            return {
                'ok': False,
                'command_id': command_id,
                'message': f'command {command_id} timed out after {timeout}s',
            }
        finally:
            self._pending.pop(command_id, None)

    async def send_command(
        self,
        name: str,
        args: dict[str, Any] | None = None,
        command_id: str | None = None,
    ) -> str | None:
        """Send a command and register a future for its result.
        Returns the command_id used (pass it to wait_for_command_result)
        or None if no robot is connected. Backwards-compatible with
        callers that did `if not sent: ...` — None is falsy."""
        if self.websocket is None:
            return None
        cmd_id = command_id or f'cmd-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}'
        # Register the future BEFORE sending so a fast firmware can't
        # land a result before there's anything to resolve.
        loop = asyncio.get_running_loop()
        self._pending[cmd_id] = loop.create_future()
        payload = {
            'type': 'command',
            'command_id': cmd_id,
            'name': name,
            'args': args or {},
        }
        try:
            await self.send(payload)
        except Exception:
            self._pending.pop(cmd_id, None)
            raise
        state = state_manager.state
        state.robot.active_command_id = cmd_id
        state.robot_status = f'command:{name}'
        state_manager.add_event(f'Robot command sent: {name}')
        return cmd_id

    async def send(self, payload: dict[str, Any]) -> None:
        if self.websocket is None:
            return
        await self.websocket.send_text(json.dumps(payload))


robot_ws_service = RobotWebSocketService()
