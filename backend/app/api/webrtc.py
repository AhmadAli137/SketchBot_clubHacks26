import asyncio
import io

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.media import WebRTCConfigResponse
from app.services.ice_config_service import ice_config_service
from app.services.camera_service import camera_service

try:
    import av
    from aiortc import RTCPeerConnection, RTCConfiguration, RTCIceServer, RTCSessionDescription, VideoStreamTrack
except ImportError:  # pragma: no cover - optional dependency path
    av = None
    RTCPeerConnection = None
    RTCConfiguration = None
    RTCIceServer = None
    RTCSessionDescription = None
    VideoStreamTrack = object

router = APIRouter(prefix='/api/webrtc')
pcs: set = set()


class WebRTCOffer(BaseModel):
    sdp: str
    type: str


def _rtc_configuration():
    if RTCConfiguration is None or RTCIceServer is None:
        return None

    ice_servers = []
    for server in ice_config_service.get_ice_servers():
        ice_servers.append(
            RTCIceServer(
                urls=server["urls"],
                username=server.get("username"),
                credential=server.get("credential"),
            )
        )
    return RTCConfiguration(iceServers=ice_servers)


class CameraVideoTrack(VideoStreamTrack):
    def __init__(self) -> None:
        super().__init__()
        self._last_seq = -1

    async def recv(self):
        if av is None:
            raise RuntimeError('WebRTC support is unavailable')
        pts, time_base = await self.next_timestamp()
        payload, seq = await asyncio.to_thread(camera_service.wait_for_frame, self._last_seq, 1.0)
        if not payload:
            frame = av.VideoFrame(width=640, height=480, format='rgb24')
            frame.pts = pts
            frame.time_base = time_base
            return frame

        self._last_seq = seq
        image = av.open(io.BytesIO(payload), format='jpeg')
        try:
            video_frame = next(image.decode(video=0))
        finally:
            image.close()
        video_frame.pts = pts
        video_frame.time_base = time_base
        return video_frame


@router.get('/config', response_model=WebRTCConfigResponse)
async def webrtc_config():
    return WebRTCConfigResponse(ice_servers=ice_config_service.get_ice_servers())


@router.post('/offer')
async def webrtc_offer(offer: WebRTCOffer):
    if RTCPeerConnection is None or RTCSessionDescription is None or av is None:
        raise HTTPException(status_code=503, detail='WebRTC dependencies are not installed on the backend')

    pc = RTCPeerConnection(configuration=_rtc_configuration())
    pcs.add(pc)

    @pc.on('connectionstatechange')
    async def on_connectionstatechange():
        if pc.connectionState in {'failed', 'closed', 'disconnected'}:
            await pc.close()
            pcs.discard(pc)

    track = CameraVideoTrack()
    pc.addTrack(track)

    await pc.setRemoteDescription(RTCSessionDescription(sdp=offer.sdp, type=offer.type))
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return {
        'sdp': pc.localDescription.sdp,
        'type': pc.localDescription.type,
    }
