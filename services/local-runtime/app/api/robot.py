from fastapi import APIRouter, HTTPException

from app.models.command import (
    MotorSetRequest,
    MotorSetResponse,
    RobotCommandRequest,
    RobotCommandResponse,
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

    sent = await robot_ws_service.send_command(payload.command)
    if not sent:
        raise HTTPException(status_code=503, detail='Robot websocket not connected')

    return RobotCommandResponse(
        accepted=True,
        command=payload.command,
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
    sent = await robot_ws_service.send_command(
        'motor.set',
        args={'left_mps': payload.left_mps, 'right_mps': payload.right_mps},
    )
    return MotorSetResponse(
        accepted=True,
        sent=sent,
        robot_status=state_manager.state.robot_status,
    )


@router.post("/demo/{sequence_id}")
async def run_robot_demo(sequence_id: str, step_index: int = 0) -> dict:
    try:
        return await demo_service.run_step(sequence_id, step_index)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except IndexError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
