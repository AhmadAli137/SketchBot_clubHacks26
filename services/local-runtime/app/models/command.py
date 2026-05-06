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
