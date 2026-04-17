"""
Autonomous agent API — POST /api/agent/run streams the agent's execution as SSE.

SSE event types:
  {"type": "plan",        "text": "..."}
  {"type": "tool_call",   "name": "...", "args": {...}}
  {"type": "tool_result", "tool": "...", "ok": bool, "message": "..."}
  {"type": "done",        "summary": "..."}
  {"type": "error",       "message": "..."}
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.agent_service import agent_service

router = APIRouter(prefix="/api/agent", tags=["agent"])


class AgentRunRequest(BaseModel):
    goal: str = Field(..., description="Plain-English goal for the robot, e.g. 'draw a 15 cm square'")


@router.post("/run")
async def agent_run(req: AgentRunRequest) -> StreamingResponse:
    """
    Start an autonomous agent run. Streams Server-Sent Events until the task
    is complete or an error occurs.
    """
    if agent_service.is_running():
        async def already_running():
            import json
            yield f"data: {json.dumps({'type': 'error', 'message': 'Agent is already running. POST /api/agent/stop first.'})}\n\n"
        return StreamingResponse(
            already_running(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return StreamingResponse(
        agent_service.stream_run(req.goal),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/stop")
async def agent_stop() -> dict:
    """Abort the currently running agent."""
    agent_service.abort()
    return {"ok": True, "message": "abort signal sent"}


@router.get("/status")
async def agent_status() -> dict:
    """Check whether the agent is currently running."""
    return {
        "running": agent_service.is_running(),
        "available": True,
    }
