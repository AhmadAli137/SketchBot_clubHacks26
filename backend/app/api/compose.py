from fastapi import APIRouter

from app.models.command import PromptDraftRequest, PromptDraftResponse
from app.models.job import PromptComposeRequest, PromptComposeResponse, TaskListResponse, TaskRecord
from app.services.camera_service import camera_service
from app.services.overlay_service import overlay_service
from app.services.prompt_generation_service import prompt_generation_service
from app.services.state_manager import state_manager
from app.services.task_library import task_library

router = APIRouter(prefix="/api/compose")


@router.get('/tasks', response_model=TaskListResponse)
def list_tasks() -> TaskListResponse:
    return TaskListResponse(tasks=[TaskRecord(**task) for task in task_library.list_tasks()])


@router.post('/prompt', response_model=PromptComposeResponse)
def compose_prompt(payload: PromptComposeRequest) -> PromptComposeResponse:
    suggested_paths = max(3, min(12, len(payload.prompt.split()) + 2))
    job_name = payload.prompt[:36].strip() or 'Untitled draft'
    svg_content = prompt_generation_service.generate_svg(payload.prompt)
    task = task_library.create_task(
        name=job_name,
        source_type='prompt',
        prompt=payload.prompt,
        svg_content=svg_content,
        path_count=suggested_paths,
    )

    state = state_manager.state
    state.active_job.id = task['id']
    state.active_job.name = job_name
    state.active_job.status = 'draft'
    state.active_job.source_type = 'prompt'
    state.active_job.path_count = suggested_paths
    state.active_job.prompt = payload.prompt
    state.workflow_state = 'draft_ready'
    camera_service.set_demo_frame('Prompt draft preview ready')
    overlay_service.set_path_label(job_name)
    overlay_service.set_overlay_asset(svg_path=svg_content, image_data_url=None, source_name=job_name, source_kind='prompt')
    state_manager.add_event(f'Prompt drafted into job: {job_name}')
    return PromptComposeResponse(accepted=True, task=TaskRecord(**task))


@router.post("/draft", response_model=PromptDraftResponse)
def create_prompt_draft(payload: PromptDraftRequest) -> PromptDraftResponse:
    response = compose_prompt(PromptComposeRequest(prompt=payload.prompt))
    return PromptDraftResponse(
        accepted=response.accepted,
        job_name=response.task.name,
        source_type=response.task.source_type,
        suggested_paths=response.task.path_count,
    )
