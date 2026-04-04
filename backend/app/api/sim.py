from fastapi import APIRouter

from app.models.job import SimulationStateUpdate
from app.services.state_manager import state_manager

router = APIRouter()


@router.post("/api/sim/state")
def update_sim_state(payload: SimulationStateUpdate) -> dict:
    state = state_manager.state

    if payload.robot_connected is not None:
        state.robot_connected = payload.robot_connected
    if payload.robot_status is not None:
        state.robot_status = payload.robot_status
    if payload.workflow_state is not None:
        state.workflow_state = payload.workflow_state
    if payload.localization_confidence is not None:
        state.localization_confidence = payload.localization_confidence
    if payload.camera_online is not None:
        state.camera.online = payload.camera_online
    if payload.canvas_detected is not None:
        state.canvas.detected = payload.canvas_detected
    if payload.canvas_confidence is not None:
        state.canvas.confidence = payload.canvas_confidence
    if payload.robot_x_mm is not None:
        state.robot_pose.x_mm = payload.robot_x_mm
    if payload.robot_y_mm is not None:
        state.robot_pose.y_mm = payload.robot_y_mm
    if payload.robot_heading_deg is not None:
        state.robot_pose.heading_deg = payload.robot_heading_deg
    if payload.pen_down is not None:
        state.robot_pose.pen_down = payload.pen_down
    if payload.event:
        state_manager.add_event(payload.event)

    return {"ok": True, "state": state_manager.snapshot()}
