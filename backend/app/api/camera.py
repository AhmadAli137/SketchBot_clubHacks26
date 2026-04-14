from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import Response, StreamingResponse

from app.models.media import (
    CameraFeedInfo,
    CameraSourceRequest,
    CameraSourceResponse,
    PhoneWebRTCSessionRequest,
    PhoneWebRTCSessionResponse,
    RTCSignalDescription,
    RTCSignalStatusResponse,
)
from app.services.camera_service import camera_service
from app.services.media_session_service import media_session_service
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


def _serialize_ice_servers(ice_servers):
    return [
        {
            'urls': server.urls,
            'username': server.username,
            'credential': server.credential,
        }
        for server in (ice_servers or [])
    ]


def _phone_webrtc_session_response() -> PhoneWebRTCSessionResponse:
    state = state_manager.state
    session = state.camera.media_session
    return PhoneWebRTCSessionResponse(
        accepted=True,
        source=state.camera.source,
        source_status=state.camera.source_status,
        session_id=session.session_id or '',
        ingest_protocol=session.ingest_protocol or 'whip',
        viewer_protocol=session.viewer_protocol or 'webrtc',
        publisher_status=session.publisher_status,
        viewer_status=session.viewer_status,
        analysis_mode=session.analysis_mode,
        whip_url=session.whip_url,
        viewer_path=session.viewer_path,
        device_label=session.device_label,
        ice_servers=_serialize_ice_servers(session.ice_servers),
        message=state.camera.latest_frame_label,
    )


@router.get('/feed', response_model=CameraFeedInfo)
def get_camera_feed() -> CameraFeedInfo:
    camera_service.capture_frame()
    state = state_manager.state
    default_frame_url = '/api/camera/stream' if state.camera.source == 'browser-camera' else None
    return CameraFeedInfo(
        online=state.camera.online,
        source=state.camera.source,
        source_status=state.camera.source_status,
        frame_label=state.camera.latest_frame_label,
        frame_url=state.camera.latest_frame_url or default_frame_url,
        external_url=state.camera.external_url,
        supports_webrtc=state.camera.supports_webrtc,
        mock_mode=state.operator.mock_mode,
    )


@router.post('/source', response_model=CameraSourceResponse)
def set_camera_source(payload: CameraSourceRequest) -> CameraSourceResponse:
    camera_service.set_source(payload.source, payload.external_url)
    state = state_manager.state
    state_manager.add_event(f'Camera source selected: {state.camera.source}')
    return CameraSourceResponse(
        accepted=True,
        source=state.camera.source,
        source_status=state.camera.source_status,
        frame_url=state.camera.latest_frame_url,
        external_url=state.camera.external_url,
        supports_webrtc=state.camera.supports_webrtc,
        message=state.camera.latest_frame_label,
    )


@router.post('/browser-frame')
def upload_browser_frame(payload: bytes = Body(..., media_type='image/jpeg')):
    accepted = camera_service.publish_browser_frame(payload)
    state = state_manager.state
    return {
        'accepted': accepted,
        'source': state.camera.source,
        'source_status': state.camera.source_status,
        'frame_label': state.camera.latest_frame_label,
    }


@router.get('/phone-webrtc/session', response_model=PhoneWebRTCSessionResponse)
def get_phone_webrtc_session() -> PhoneWebRTCSessionResponse:
    state = state_manager.state
    session = state.camera.media_session
    if not session.session_id or state.camera.source != 'phone-webrtc':
        raise HTTPException(status_code=404, detail='No phone WebRTC session is currently provisioned')
    return _phone_webrtc_session_response()


@router.post('/phone-webrtc/session', response_model=PhoneWebRTCSessionResponse)
def provision_phone_webrtc_session(payload: PhoneWebRTCSessionRequest) -> PhoneWebRTCSessionResponse:
    media_session_service.provision_phone_webrtc_session(payload.device_label, payload.force_new)
    state_manager.add_event('Phone WebRTC session provisioned')
    return _phone_webrtc_session_response()


@router.post('/phone-webrtc/publisher-offer', response_model=RTCSignalStatusResponse)
def store_phone_webrtc_publisher_offer(payload: RTCSignalDescription) -> RTCSignalStatusResponse:
    try:
        session = media_session_service.store_publisher_offer(payload.session_id, payload.sdp, payload.type)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return RTCSignalStatusResponse(
        accepted=True,
        session_id=payload.session_id,
        publisher_status=session.publisher_status,
        viewer_status=session.viewer_status,
        source_status=state_manager.state.camera.source_status,
        message=state_manager.state.camera.latest_frame_label,
    )


@router.get('/phone-webrtc/publisher-offer/{session_id}')
def get_phone_webrtc_publisher_offer(session_id: str):
    try:
        offer = media_session_service.get_publisher_offer(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if offer is None:
        raise HTTPException(status_code=404, detail='Publisher offer not available yet')
    sdp, desc_type = offer
    return {'session_id': session_id, 'sdp': sdp, 'type': desc_type}


@router.post('/phone-webrtc/viewer-answer', response_model=RTCSignalStatusResponse)
def store_phone_webrtc_viewer_answer(payload: RTCSignalDescription) -> RTCSignalStatusResponse:
    try:
        session = media_session_service.store_viewer_answer(payload.session_id, payload.sdp, payload.type)
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if 'not found' in message.lower() else 409
        raise HTTPException(status_code=status_code, detail=message) from exc
    return RTCSignalStatusResponse(
        accepted=True,
        session_id=payload.session_id,
        publisher_status=session.publisher_status,
        viewer_status=session.viewer_status,
        source_status=state_manager.state.camera.source_status,
        message=state_manager.state.camera.latest_frame_label,
    )


@router.get('/phone-webrtc/viewer-answer/{session_id}')
def get_phone_webrtc_viewer_answer(session_id: str):
    try:
        answer = media_session_service.get_viewer_answer(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if answer is None:
        raise HTTPException(status_code=404, detail='Viewer answer not available yet')
    sdp, desc_type = answer
    return {'session_id': session_id, 'sdp': sdp, 'type': desc_type}


@router.post('/phone-webrtc/publisher-live/{session_id}', response_model=RTCSignalStatusResponse)
def mark_phone_webrtc_publisher_live(session_id: str) -> RTCSignalStatusResponse:
    try:
        session = media_session_service.mark_publisher_live(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return RTCSignalStatusResponse(
        accepted=True,
        session_id=session_id,
        publisher_status=session.publisher_status,
        viewer_status=session.viewer_status,
        source_status=state_manager.state.camera.source_status,
        message=state_manager.state.camera.latest_frame_label,
    )


@router.post('/phone-webrtc/viewer-live/{session_id}', response_model=RTCSignalStatusResponse)
def mark_phone_webrtc_viewer_live(session_id: str) -> RTCSignalStatusResponse:
    try:
        session = media_session_service.mark_viewer_live(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return RTCSignalStatusResponse(
        accepted=True,
        session_id=session_id,
        publisher_status=session.publisher_status,
        viewer_status=session.viewer_status,
        source_status=state_manager.state.camera.source_status,
        message=state_manager.state.camera.latest_frame_label,
    )


@router.post('/phone-webrtc/publisher-stop/{session_id}', response_model=RTCSignalStatusResponse)
def mark_phone_webrtc_publisher_stop(session_id: str) -> RTCSignalStatusResponse:
    try:
        session = media_session_service.mark_publisher_stopped(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return RTCSignalStatusResponse(
        accepted=True,
        session_id=session_id,
        publisher_status=session.publisher_status,
        viewer_status=session.viewer_status,
        source_status=state_manager.state.camera.source_status,
        message=state_manager.state.camera.latest_frame_label,
    )


@router.post('/phone-webrtc/analysis-frame')
def upload_phone_webrtc_analysis_frame(payload: bytes = Body(..., media_type='image/jpeg')):
    accepted = camera_service.publish_phone_webrtc_analysis_frame(payload)
    state = state_manager.state
    return {
        'accepted': accepted,
        'source': state.camera.source,
        'source_status': state.camera.source_status,
        'frame_label': state.camera.latest_frame_label,
    }


@router.post('/phone-webrtc/viewer-stop/{session_id}', response_model=RTCSignalStatusResponse)
def mark_phone_webrtc_viewer_stop(session_id: str) -> RTCSignalStatusResponse:
    try:
        session = media_session_service.mark_viewer_stopped(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return RTCSignalStatusResponse(
        accepted=True,
        session_id=session_id,
        publisher_status=session.publisher_status,
        viewer_status=session.viewer_status,
        source_status=state_manager.state.camera.source_status,
        message=state_manager.state.camera.latest_frame_label,
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
