from pydantic import BaseModel


class CameraFeedInfo(BaseModel):
    online: bool
    source: str
    frame_label: str
    frame_url: str | None
    mock_mode: bool


class UploadResponse(BaseModel):
    accepted: bool
    filename: str
    content_type: str | None
    bytes_received: int
    stored: bool
    task_id: str | None = None
    overlay_ready: bool = False
