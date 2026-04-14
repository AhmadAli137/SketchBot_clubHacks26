from fastapi import APIRouter

from app.models.media import WebRTCConfigResponse
from app.services.ice_config_service import ice_config_service

router = APIRouter(prefix='/api/webrtc')


@router.get('/config', response_model=WebRTCConfigResponse)
async def webrtc_config():
    return WebRTCConfigResponse(ice_servers=ice_config_service.get_ice_servers())
