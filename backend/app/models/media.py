from typing import Literal

from pydantic import BaseModel, Field


class RTCIceServerConfig(BaseModel):
    urls: str | list[str]
    username: str | None = None
    credential: str | None = None


class CameraFeedInfo(BaseModel):
    online: bool
    source: str
    source_status: str
    frame_label: str
    frame_url: str | None
    external_url: str | None
    supports_webrtc: bool
    mock_mode: bool


class CameraSourceRequest(BaseModel):
    source: Literal['browser-camera', 'phone-webrtc', 'external-camera', 'kit-webrtc', 'demo']
    external_url: str | None = None


class CameraSourceResponse(BaseModel):
    accepted: bool
    source: str
    source_status: str
    frame_url: str | None
    external_url: str | None
    supports_webrtc: bool
    message: str


class PhoneWebRTCSessionRequest(BaseModel):
    device_label: str | None = None
    force_new: bool = False


class PhoneWebRTCSessionResponse(BaseModel):
    accepted: bool
    source: str
    source_status: str
    session_id: str
    ingest_protocol: str
    viewer_protocol: str
    publisher_status: str
    viewer_status: str
    analysis_mode: str
    whip_url: str | None
    viewer_path: str | None
    device_label: str | None = None
    ice_servers: list[RTCIceServerConfig] = Field(default_factory=list)
    message: str


class RTCSignalDescription(BaseModel):
    session_id: str
    sdp: str
    type: Literal['offer', 'answer']


class RTCSignalStatusResponse(BaseModel):
    accepted: bool
    session_id: str
    publisher_status: str
    viewer_status: str
    source_status: str
    message: str


class WebRTCConfigResponse(BaseModel):
    ice_servers: list[RTCIceServerConfig] = Field(default_factory=list)


class UploadResponse(BaseModel):
    accepted: bool
    filename: str
    content_type: str | None
    bytes_received: int
    stored: bool
    task_id: str | None = None
    overlay_ready: bool = False
