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
    # Latest HC-SR04 distance reading from the firmware, in cm. None when
    # there's no echo (out of range, sensor missing, or wiring fault) so
    # downstream consumers (UI gauges, obstacle gates) can distinguish a
    # genuine zero/short read from "no signal."
    last_distance_cm: float | None = None


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


class RTCIceServerSummary(BaseModel):
    urls: str | list[str]
    username: str | None = None
    credential: str | None = None


class MediaSessionSummary(BaseModel):
    session_id: str | None = None
    ingest_protocol: str | None = None
    viewer_protocol: str | None = None
    publisher_status: str = 'idle'
    viewer_status: str = 'idle'
    analysis_mode: str = 'direct-frame'
    whip_url: str | None = None
    viewer_path: str | None = None
    device_label: str | None = None
    ice_servers: list[RTCIceServerSummary] = Field(default_factory=list)


class CameraState(BaseModel):
    online: bool = False
    source: str = 'companion-camera'
    source_status: str = 'waiting'
    latest_frame_label: str = 'Waiting for companion app frames'
    latest_frame_url: str | None = None
    external_url: str | None = None
    supports_webrtc: bool = True
    frame_width: int = 1280
    frame_height: int = 720
    media_session: MediaSessionSummary = Field(default_factory=MediaSessionSummary)
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
    # Per-unit serial reported by the firmware on hello (e.g. SKETCH-A1B2-C3D4).
    # Surfaced to the desktop UI so the user can claim this bot against
    # their account on the admin web; null until a real device connects.
    robot_serial: str | None = None
    # Who's currently driving the bot per the firmware's arbitration
    # (Phase 2c.5). Rides each heartbeat — 'lan' means this desktop is
    # in control, 'cloud' means the mobile companion / another session
    # is driving, 'none' means idle (no command in the last ~250 ms),
    # null means the firmware hasn't reported yet.
    active_controller: str | None = None
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
