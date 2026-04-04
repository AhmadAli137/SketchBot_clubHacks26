from fastapi import APIRouter

from app.services.state_manager import state_manager

router = APIRouter()


@router.get("/state")
def get_state() -> dict:
    return state_manager.snapshot()
