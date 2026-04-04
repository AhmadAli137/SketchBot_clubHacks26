import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.robot_ws_service import robot_ws_service
from app.services.state_manager import state_manager

router = APIRouter()


@router.websocket("/ws/state")
async def websocket_state(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            await websocket.send_text(json.dumps(state_manager.snapshot()))
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        return


@router.websocket('/ws/robot')
async def websocket_robot(websocket: WebSocket) -> None:
    await robot_ws_service.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            await robot_ws_service.handle_message(raw)
    except WebSocketDisconnect:
        await robot_ws_service.disconnect()
