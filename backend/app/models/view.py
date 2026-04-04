from pydantic import BaseModel


class MonitorView(BaseModel):
    status_text: str
    backend_online: bool
    camera_online: bool
    frame_label: str
    overlay_enabled: bool
    overlay_path_label: str
    canvas_detected: bool
    localization_confidence: float
    robot_x_mm: float
    robot_y_mm: float
    robot_heading_deg: float


class ComposeView(BaseModel):
    prompt: str | None
    active_job_name: str | None
    active_job_status: str
    source_type: str | None
    path_count: int


class RobotView(BaseModel):
    connected: bool
    robot_status: str
    workflow_state: str
    x_mm: float
    y_mm: float
    heading_deg: float
    pen_down: bool
