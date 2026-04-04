from uuid import uuid4

from fastapi import APIRouter

from app.models.job import CreateJobRequest, CreateJobResponse
from app.services.state_manager import state_manager

router = APIRouter()


@router.post("/jobs", response_model=CreateJobResponse)
def create_job(payload: CreateJobRequest) -> CreateJobResponse:
    job_id = str(uuid4())
    state = state_manager.state
    state.active_job.id = job_id
    state.active_job.name = payload.name
    state.active_job.status = "planned"
    state.active_job.source_type = payload.source_type
    state.active_job.path_count = 5 if payload.source_type == "text" else 8
    state.active_job.prompt = payload.description
    state.workflow_state = "plan_ready"
    state.canvas.width_mm = payload.canvas_width_mm
    state.canvas.height_mm = payload.canvas_height_mm
    state.overlay.path_label = payload.name
    state_manager.add_event(
        f"Job planned: {payload.name} ({payload.source_type}, simplification={payload.simplification})"
    )
    return CreateJobResponse(
        id=job_id,
        name=payload.name,
        status="planned",
        source_type=payload.source_type,
    )
