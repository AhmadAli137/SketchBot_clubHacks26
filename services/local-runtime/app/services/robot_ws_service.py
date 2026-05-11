from __future__ import annotations

import asyncio
import json
import time
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
        # Agent support — command result signalling
        self._command_result_event: asyncio.Event = asyncio.Event()
        self._last_command_result: dict[str, Any] | None = None

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.websocket = websocket

    async def disconnect(self) -> None:
        self.websocket = None
        self.robot_id = None
        self.last_heartbeat_at = None
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
            # Signal any waiting agent
            self._last_command_result = {'ok': msg.ok, 'command_id': msg.command_id, 'message': msg.message}
            self._command_result_event.set()
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

    async def wait_for_command_result(self, timeout: float = 30.0) -> dict[str, Any]:
        """Block until the robot acknowledges the last command or timeout expires."""
        try:
            await asyncio.wait_for(self._command_result_event.wait(), timeout=timeout)
            return self._last_command_result or {'ok': False, 'message': 'no result received'}
        except asyncio.TimeoutError:
            return {'ok': False, 'message': f'command timed out after {timeout}s'}

    async def send_command(self, name: str, args: dict[str, Any] | None = None, command_id: str | None = None) -> bool:
        if self.websocket is None:
            return False
        # Reset result event before sending
        self._command_result_event.clear()
        self._last_command_result = None
        payload = {
            'type': 'command',
            'command_id': command_id or f'cmd-{int(time.time() * 1000)}',
            'name': name,
            'args': args or {},
        }
        await self.send(payload)
        state = state_manager.state
        state.robot.active_command_id = payload['command_id']
        state.robot_status = f'command:{name}'
        state_manager.add_event(f'Robot command sent: {name}')
        return True

    async def send(self, payload: dict[str, Any]) -> None:
        if self.websocket is None:
            return
        await self.websocket.send_text(json.dumps(payload))


robot_ws_service = RobotWebSocketService()
