from typing import Any, Literal

from pydantic import BaseModel, Field


RobotCommandName = Literal['home', 'pen_up', 'pen_down', 'pause', 'stop', 'connect_mock_bot', 'status', 'move_to']


class PromptDraftRequest(BaseModel):
    prompt: str


class PromptDraftResponse(BaseModel):
    accepted: bool
    job_name: str
    source_type: str
    suggested_paths: int


class RobotCommandRequest(BaseModel):
    command: RobotCommandName


class RobotCommandResponse(BaseModel):
    accepted: bool
    command: RobotCommandName
    robot_status: str


class MotorSetRequest(BaseModel):
    """Raw differential-drive setpoint streamed from the desktop program
    executor at ~30 Hz while a program is running on the real robot.
    Each call updates the motor PWM and returns immediately; the desktop
    owns timing (block durations, condition polling) and emits a final
    {0, 0} setpoint at the end of every block to stop. Speeds are signed
    metres/second per wheel — negative = backward."""
    left_mps: float
    right_mps: float


class MotorSetResponse(BaseModel):
    accepted: bool
    sent: bool
    robot_status: str


class RobotRawCommandRequest(BaseModel):
    """Localhost bring-up channel — ships an arbitrary JSON command to the
    firmware. Used by the hardware smoke test (services/local-runtime/
    scripts/hardware_smoke_test.py) to exercise every command in
    ws_protocol.cpp's dispatch (move_forward / rotate / pen_up / etc with
    real args) without baking each one into the typed RobotCommandName
    enum. Optionally awaits the firmware's command_result so the script
    can sequence blocking moves cleanly."""
    name: str
    args: dict[str, Any] | None = None
    # When True, the endpoint blocks until the firmware acknowledges the
    # command via command_result (or the timeout fires). Useful for
    # sequencing moves; set False for fire-and-forget like motor.set
    # streams.
    wait: bool = False
    timeout_s: float = 30.0


class RobotRawCommandResponse(BaseModel):
    sent: bool
    result: dict[str, Any] | None = None
    robot_status: str


class RobotHelloMessage(BaseModel):
    type: Literal['hello']
    robot_id: str
    firmware_version: str
    board: str
    capabilities: list[str] = Field(default_factory=list)
    auth_token: str | None = None


class RobotHeartbeatMessage(BaseModel):
    type: Literal['heartbeat']
    robot_id: str
    uptime_ms: int | None = None
    free_heap: int | None = None
    # Who's currently driving (Phase 2c.5). Firmware arbitrates between
    # the LAN runtime and the cloud relay; this field rides every
    # heartbeat so the desktop and mobile can show 'you are driving' vs
    # 'another session is driving' without an extra poll. Values:
    # 'lan' | 'cloud' | 'none' (idle for ≥250 ms).
    active_controller: str | None = None


class RobotTelemetryMessage(BaseModel):
    type: Literal['telemetry']
    robot_id: str
    x_mm: float | None = None
    y_mm: float | None = None
    heading_deg: float | None = None
    pen_down: bool | None = None
    moving: bool | None = None
    homed: bool | None = None
    queue_depth: int | None = None
    # HC-SR04 round-trip distance to the nearest object ahead, in cm.
    # Firmware sends -1 when no echo arrives (out of range or sensor
    # missing); the websocket service translates that to None before
    # storing in app state so consumers see a clean "no reading" signal.
    distance_cm: float | None = None
    fault: dict[str, Any] | None = None


class RobotCommandResultMessage(BaseModel):
    type: Literal['command_result']
    command_id: str
    ok: bool
    message: str | None = None


class RobotFaultMessage(BaseModel):
    type: Literal['fault']
    code: str
    message: str


class RobotLogMessage(BaseModel):
    type: Literal['log']
    level: str
    message: str
