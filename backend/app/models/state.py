from pydantic import BaseModel, Field


class Point2D(BaseModel):
    x: float
    y: float


class AprilTagDetection(BaseModel):
    tag_id: int
    family: str = 'tag36h11'
    center: Point2D
    corners: list[Point2D] = Field(default_factory=list)
    decision_margin: float = 0.0


class CanvasBorder(BaseModel):
    corners: list[Point2D] = Field(default_factory=list)
    source_tag_ids: list[int] = Field(default_factory=list)
    detected: bool = False


class RobotPose(BaseModel):
    x_mm: float = 0.0
    y_mm: float = 0.0
    heading_deg: float = 0.0
    pen_down: bool = False


class RobotFault(BaseModel):
    code: str | None = None
    message: str | None = None


class RobotSummary(BaseModel):
    connection_state: str = 'disconnected'
    runtime_state: str = 'idle'
    motion_state: str = 'idle'
    pen_state: str = 'unknown'
    is_homed: bool = False
    active_command_id: str | None = None
    fault: RobotFault = Field(default_factory=RobotFault)
    pose: RobotPose = Field(default_factory=RobotPose)


class WorkflowSummary(BaseModel):
    task_state: str = 'idle'
    active_job_id: str | None = None
    is_mock_mode: bool = True


class CanvasState(BaseModel):
    detected: bool = False
    width_mm: float = 297.0
    height_mm: float = 210.0
    tag_ids: list[int] = Field(default_factory=lambda: [0, 1, 2, 3])
    confidence: float = 0.0


class CameraState(BaseModel):
    online: bool = False
    source: str = 'demo'
    latest_frame_label: str = 'No frame'
    latest_frame_url: str | None = None
    frame_width: int = 1280
    frame_height: int = 720
    april_tag_detections: list[AprilTagDetection] = Field(default_factory=list)
    canvas_border: CanvasBorder = Field(default_factory=CanvasBorder)


class OverlayState(BaseModel):
    enabled: bool = True
    show_tags: bool = True
    show_path: bool = True
    show_robot: bool = True
    path_label: str = 'Demo path'
    svg_path: str | None = None
    image_data_url: str | None = None
    source_name: str | None = None
    source_kind: str | None = None


class JobSummary(BaseModel):
    id: str | None = None
    name: str | None = None
    status: str = 'idle'
    source_type: str | None = None
    path_count: int = 0
    prompt: str | None = None


class OperatorSummary(BaseModel):
    status_text: str = 'Mock mode'
    last_action: str = 'Waiting for operator'
    mock_mode: bool = True
    connection_mode: str = 'mock'


class AppState(BaseModel):
    robot_connected: bool = False
    robot_status: str = 'disconnected'
    workflow_state: str = 'disconnected'
    localization_confidence: float = 0.0
    camera_online: bool = False

    robot: RobotSummary = Field(default_factory=RobotSummary)
    workflow: WorkflowSummary = Field(default_factory=WorkflowSummary)
    canvas: CanvasState = Field(default_factory=CanvasState)
    camera: CameraState = Field(default_factory=CameraState)
    overlay: OverlayState = Field(default_factory=OverlayState)
    robot_pose: RobotPose = Field(default_factory=RobotPose)
    active_job: JobSummary = Field(default_factory=JobSummary)
    operator: OperatorSummary = Field(default_factory=OperatorSummary)
    recent_events: list[str] = Field(
        default_factory=lambda: [
            'SketchBot backend started',
            'Waiting for camera, localization, and robot connection',
        ]
    )
