from fastapi import APIRouter, HTTPException

from app.models.command import RobotCommandRequest, RobotCommandResponse
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
