from pydantic import BaseModel, Field


class CreateJobRequest(BaseModel):
    name: str
    source_type: str
    description: str | None = None
    canvas_width_mm: float = 297.0
    canvas_height_mm: float = 210.0
    simplification: str = "medium"


class CreateJobResponse(BaseModel):
    id: str
    name: str
    status: str
    source_type: str


class TaskRecord(BaseModel):
    id: str
    name: str
    source_type: str
    prompt: str | None = None
    original_filename: str | None = None
    svg_content: str | None = None
    image_data_url: str | None = None
    path_count: int = 0


class PromptComposeRequest(BaseModel):
    prompt: str


class PromptComposeResponse(BaseModel):
    accepted: bool
    task: TaskRecord


class TaskListResponse(BaseModel):
    tasks: list[TaskRecord]


class SimulationStateUpdate(BaseModel):
    robot_connected: bool | None = None
    robot_status: str | None = None
    workflow_state: str | None = None
    localization_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    camera_online: bool | None = None
    canvas_detected: bool | None = None
    canvas_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    robot_x_mm: float | None = None
    robot_y_mm: float | None = None
    robot_heading_deg: float | None = None
    pen_down: bool | None = None
    event: str | None = None
