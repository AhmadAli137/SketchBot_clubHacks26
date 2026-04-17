from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.lesson_service import lesson_service

router = APIRouter(prefix="/api/lessons", tags=["lessons"])


class GenerateLessonRequest(BaseModel):
    concept_id: str
    layer: str = "intuitive"
    age_group: str = "builder"
    force_regenerate: bool = False


@router.post("/generate")
async def generate_lesson(req: GenerateLessonRequest) -> dict:
    """Generate (or retrieve cached) a structured lesson plan for a concept."""
    return await lesson_service.generate_lesson(
        concept_id=req.concept_id,
        layer=req.layer,
        age_group=req.age_group,
        force_regenerate=req.force_regenerate,
    )


@router.get("/cached")
def list_cached_lessons() -> list[dict]:
    """List all cached lesson plans."""
    return lesson_service.list_cached_lessons()


@router.get("/status")
def lesson_status() -> dict:
    """Check whether lesson generation is available."""
    return {"available": lesson_service.is_available()}
