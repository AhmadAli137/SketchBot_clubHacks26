import asyncio
import io

import av
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.camera_service import camera_service

router = APIRouter(prefix='/api/webrtc')
pcs: set[RTCPeerConnection] = set()


class WebRTCOffer(BaseModel):
    sdp: str
    type: str


class CameraVideoTrack(VideoStreamTrack):
    def __init__(self) -> None:
        super().__init__()
        self._last_seq = -1

    async def recv(self):
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


@router.post('/offer')
async def webrtc_offer(offer: WebRTCOffer):
    pc = RTCPeerConnection()
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
