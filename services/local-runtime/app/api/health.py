from fastapi import APIRouter

from app.core.state import app_state

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "local-runtime",
        "robot_connected": app_state.robot_connected,
        "workflow_state": app_state.workflow_state,
        "camera_online": app_state.camera_online,
    }
