from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.platform import load_concept_catalog

router = APIRouter(prefix="/api/concepts", tags=["concepts"])


@router.get("")
def list_concepts() -> dict[str, list[dict]]:
    concepts = load_concept_catalog()
    return {"concepts": concepts}


@router.get("/{concept_id}")
def concept_detail(concept_id: str) -> dict:
    concepts = load_concept_catalog()
    for concept in concepts:
        if concept.get("concept_id") == concept_id:
            return concept
    raise HTTPException(status_code=404, detail=f"Concept '{concept_id}' not found")
