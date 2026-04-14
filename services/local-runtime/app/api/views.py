from fastapi import APIRouter

from app.models.view import ComposeView, MonitorView, RobotView
from app.services.state_manager import state_manager

router = APIRouter(prefix="/api/views")


@router.get("/monitor", response_model=MonitorView)
def get_monitor_view() -> MonitorView:
    state = state_manager.state
    return MonitorView(
        status_text=state.operator.status_text,
        backend_online=True,
        camera_online=state.camera.online,
        frame_label=state.camera.latest_frame_label,
        overlay_enabled=state.overlay.enabled,
        overlay_path_label=state.overlay.path_label,
        canvas_detected=state.canvas.detected,
        localization_confidence=state.localization_confidence,
        robot_x_mm=state.robot_pose.x_mm,
        robot_y_mm=state.robot_pose.y_mm,
        robot_heading_deg=state.robot_pose.heading_deg,
    )


@router.get("/compose", response_model=ComposeView)
def get_compose_view() -> ComposeView:
    state = state_manager.state
    return ComposeView(
        prompt=state.active_job.prompt,
        active_job_name=state.active_job.name,
        active_job_status=state.active_job.status,
        source_type=state.active_job.source_type,
        path_count=state.active_job.path_count,
    )


@router.get("/robot", response_model=RobotView)
def get_robot_view() -> RobotView:
    state = state_manager.state
    return RobotView(
        connected=state.robot_connected,
        robot_status=state.robot_status,
        workflow_state=state.workflow_state,
        x_mm=state.robot_pose.x_mm,
        y_mm=state.robot_pose.y_mm,
        heading_deg=state.robot_pose.heading_deg,
        pen_down=state.robot_pose.pen_down,
    )
