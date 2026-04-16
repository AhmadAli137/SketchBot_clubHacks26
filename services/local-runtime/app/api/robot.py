from fastapi import APIRouter, HTTPException

from app.models.command import RobotCommandRequest, RobotCommandResponse
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


@router.post("/demo/{sequence_id}")
async def run_robot_demo(sequence_id: str, step_index: int = 0) -> dict:
    try:
        return await demo_service.run_step(sequence_id, step_index)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except IndexError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
