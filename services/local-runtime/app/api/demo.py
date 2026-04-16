from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.demo_service import demo_service

router = APIRouter(prefix="/api/demo", tags=["demo"])


# ─── Models ───────────────────────────────────────────────────────────────────

class RunStepRequest(BaseModel):
    demo_id: str
    step_index: int = 0


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/list")
def list_demos() -> dict:
    """Return all available demo sequences."""
    return {"demos": demo_service.list_demos()}


@router.get("/{demo_id}")
def get_demo(demo_id: str) -> dict:
    """Return full details for one demo sequence."""
    demo = demo_service.get_demo(demo_id)
    if not demo:
        raise HTTPException(status_code=404, detail=f"Demo '{demo_id}' not found.")
    return demo


@router.post("/run-step")
async def run_step(req: RunStepRequest) -> dict:
    """
    Execute one step of a demo sequence.
    Generates SVG and returns narration text for the tutor to speak.

    Frontend calls this in sequence:
      POST /api/demo/run-step { demo_id, step_index: 0 } → render SVG, speak narration
      POST /api/demo/run-step { demo_id, step_index: 1 } → ...
      ...until is_last: true
    """
    try:
        result = await demo_service.run_step(req.demo_id, req.step_index)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except IndexError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
