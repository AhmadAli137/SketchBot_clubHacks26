from fastapi import APIRouter
from fastapi.responses import Response, StreamingResponse

from app.models.media import CameraFeedInfo
from app.services.camera_service import camera_service
from app.services.overlay_preview_service import overlay_preview_service
from app.services.state_manager import state_manager

router = APIRouter(prefix='/api/camera')


MOCK_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#071022" />
      <stop offset="100%" stop-color="#0b1530" />
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)" />
  <text x="78" y="86" fill="#dff6ff" font-size="34" font-family="Arial, sans-serif">SketchBot Mock Camera Feed</text>
</svg>'''


@router.get('/feed', response_model=CameraFeedInfo)
def get_camera_feed() -> CameraFeedInfo:
    camera_service.capture_frame()
    state = state_manager.state
    return CameraFeedInfo(
        online=state.camera.online,
        source=state.camera.source,
        frame_label=state.camera.latest_frame_label,
        frame_url=state.camera.latest_frame_url or '/api/camera/stream',
        mock_mode=state.operator.mock_mode,
    )


@router.get('/frame')
def get_camera_frame():
    if camera_service.capture_frame():
        payload = camera_service.get_latest_frame()
        if payload:
            return Response(content=payload, media_type='image/jpeg')
    return Response(content=MOCK_SVG, media_type='image/svg+xml')


@router.get('/stream')
def get_camera_stream():
    return StreamingResponse(camera_service.mjpeg_stream(), media_type='multipart/x-mixed-replace; boundary=frame')


@router.get('/overlay-preview')
def get_overlay_preview():
    payload = overlay_preview_service.render_preview() or overlay_preview_service.latest_preview()
    if payload:
        return Response(content=payload, media_type='image/png')
    return Response(status_code=204)
