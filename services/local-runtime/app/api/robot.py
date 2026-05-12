import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.command import (
    MotorSetRequest,
    MotorSetResponse,
    RobotCommandRequest,
    RobotCommandResponse,
    RobotRawCommandRequest,
    RobotRawCommandResponse,
)
from app.services.demo_service import demo_service
from app.services.robot_service import robot_service
from app.services.robot_ws_service import robot_ws_service
from app.services.state_manager import state_manager

router = APIRouter(prefix="/api/robot")


@router.post("/command", response_model=RobotCommandResponse)
async def robot_command(payload: RobotCommandRequest) -> RobotCommandResponse:
    if payload.command == 'connect_mock_bot':
        robot_service.issue_command(payload.command)
        return RobotCommandResponse(
            accepted=True,
            command=payload.command,
            robot_status=state_manager.state.robot_status,
        )

    cmd_id = await robot_ws_service.send_command(payload.command)
    if not cmd_id:
        raise HTTPException(status_code=503, detail='Robot websocket not connected')

    return RobotCommandResponse(
        accepted=True,
        command=payload.command,
        robot_status=state_manager.state.robot_status,
    )


@router.post("/raw", response_model=RobotRawCommandResponse)
async def robot_raw_command(payload: RobotRawCommandRequest) -> RobotRawCommandResponse:
    """Forward any JSON command (name + args) to the firmware. Mainly used
    by the hardware smoke test to exercise move_forward / rotate / etc.
    with real args without growing the typed RobotCommandName enum.
    When wait=True, blocks until the firmware sends command_result."""
    cmd_id = await robot_ws_service.send_command(payload.name, args=payload.args)
    if not cmd_id:
        raise HTTPException(status_code=503, detail='Robot websocket not connected')
    result: dict | None = None
    if payload.wait:
        result = await robot_ws_service.wait_for_command_result(cmd_id, timeout=payload.timeout_s)
    return RobotRawCommandResponse(
        sent=True,
        result=result,
        robot_status=state_manager.state.robot_status,
    )


@router.post("/motor", response_model=MotorSetResponse)
async def robot_motor(payload: MotorSetRequest) -> MotorSetResponse:
    """Forward a raw motor setpoint from the desktop program executor to
    the firmware. Hot path during program execution — fires every block
    transition and at ~30 Hz inside `motor.until` blocks while the bot
    waits for a sensor condition. Returns 200 even when the firmware is
    not connected so the executor can fall back to simulator mode without
    a stack of red request errors."""
    cmd_id = await robot_ws_service.send_command(
        'motor.set',
        args={'left_mps': payload.left_mps, 'right_mps': payload.right_mps},
    )
    return MotorSetResponse(
        accepted=True,
        sent=cmd_id is not None,
        robot_status=state_manager.state.robot_status,
    )


# ─── Per-device calibration (Cal.2) ────────────────────────────────────────
# Three endpoints that wrap the firmware's get_calibration /
# set_calibration / clear_calibration commands. The wizard (Cal.4)
# drives them: read current → run measurement steps → POST refined
# values. Independent from the cloud — calibration is physical, never
# leaves the LAN.

class CalibrationPayload(BaseModel):
    """All fields optional. Missing fields keep the bot's current values
    (matches the firmware's partial-update semantics in ws_protocol.cpp).
    Lets the wizard run individual re-cal steps without losing the
    constants measured in earlier ones."""
    wheel_diameter_mm: float | None = None
    wheel_base_mm:     float | None = None
    lr_balance:        float | None = None
    duty_min:          int   | None = None


class CalibrationResponse(BaseModel):
    provisioned:       bool
    wheel_diameter_mm: float
    wheel_base_mm:     float
    lr_balance:        float
    duty_min:          int


async def _fetch_calibration() -> CalibrationResponse:
    """Synchronous-style helper used by both GET and POST so each returns
    the resulting state. Sends get_calibration, parses the firmware's
    JSON-in-message reply. 5 s timeout: a freshly-connected bot may
    still be loading NVS when the wizard fires its first GET on open."""
    cmd_id = await robot_ws_service.send_command('get_calibration', args=None)
    if not cmd_id:
        raise HTTPException(status_code=503, detail='Robot websocket not connected')
    result = await robot_ws_service.wait_for_command_result(cmd_id, timeout=5.0)
    if not result or not result.get('ok'):
        raise HTTPException(status_code=502, detail='Robot did not return calibration')
    try:
        parsed = json.loads(result.get('message') or '{}')
        return CalibrationResponse(**parsed)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=f'Bad calibration payload: {exc}') from exc


@router.get("/calibration", response_model=CalibrationResponse)
async def get_calibration() -> CalibrationResponse:
    """Read the firmware's current calibration. Returns defaults when
    the bot hasn't been calibrated yet (provisioned=False)."""
    return await _fetch_calibration()


@router.post("/calibration", response_model=CalibrationResponse)
async def set_calibration(payload: CalibrationPayload) -> CalibrationResponse:
    """Push new calibration values to the firmware. Partial updates are
    fine — fields left null in the payload keep their existing on-bot
    values. Returns the firmware's post-write state so callers can
    confirm the round-trip."""
    args = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not args:
        raise HTTPException(status_code=400, detail='No fields to update')
    cmd_id = await robot_ws_service.send_command('set_calibration', args=args)
    if not cmd_id:
        raise HTTPException(status_code=503, detail='Robot websocket not connected')
    result = await robot_ws_service.wait_for_command_result(cmd_id, timeout=5.0)
    if not result or not result.get('ok'):
        raise HTTPException(status_code=502, detail=(result or {}).get('message') or 'Set failed')
    # Re-fetch so the response reflects what the firmware actually
    # persisted (defends against client/firmware schema drift).
    return await _fetch_calibration()


@router.delete("/calibration", response_model=CalibrationResponse)
async def clear_calibration() -> CalibrationResponse:
    """Wipe the bot's calibration back to defaults. Used by the wizard's
    'start over' button and by ops as a recovery step."""
    cmd_id = await robot_ws_service.send_command('clear_calibration', args=None)
    if not cmd_id:
        raise HTTPException(status_code=503, detail='Robot websocket not connected')
    result = await robot_ws_service.wait_for_command_result(cmd_id, timeout=5.0)
    if not result or not result.get('ok'):
        raise HTTPException(status_code=502, detail=(result or {}).get('message') or 'Clear failed')
    return await _fetch_calibration()


@router.post("/demo/{sequence_id}")
async def run_robot_demo(sequence_id: str, step_index: int = 0) -> dict:
    try:
        return await demo_service.run_step(sequence_id, step_index)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except IndexError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
