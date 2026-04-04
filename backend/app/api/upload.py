import base64

from fastapi import APIRouter, File, UploadFile

from app.models.media import UploadResponse
from app.services.overlay_service import overlay_service
from app.services.state_manager import state_manager
from app.services.task_library import task_library

router = APIRouter(prefix='/api/upload')


@router.post('', response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)) -> UploadResponse:
    data = await file.read()
    text = data.decode('utf-8', errors='ignore')
    content_type = file.content_type or 'application/octet-stream'

    svg_content = text if 'svg' in content_type or file.filename.lower().endswith('.svg') else None
    image_data_url = None if svg_content else f'data:{content_type};base64,{base64.b64encode(data).decode("ascii")}'

    task = task_library.create_task(
        name=file.filename,
        source_type='upload',
        original_filename=file.filename,
        svg_content=svg_content,
        image_data_url=image_data_url,
        path_count=0,
    )

    state = state_manager.state
    state.active_job.id = task['id']
    state.active_job.name = task['name']
    state.active_job.status = 'uploaded'
    state.active_job.source_type = 'upload'
    state.active_job.path_count = task['path_count']
    state.active_job.prompt = None
    overlay_service.set_overlay_asset(
        svg_path=svg_content,
        image_data_url=image_data_url,
        source_name=task['name'],
        source_kind='upload',
    )
    state_manager.add_event(f'Upload received: {file.filename}')
    return UploadResponse(
        accepted=True,
        filename=file.filename,
        content_type=content_type,
        bytes_received=len(data),
        stored=True,
        task_id=task['id'],
        overlay_ready=bool(svg_content or image_data_url),
    )
