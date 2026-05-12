"""Tag-heights API.

Read / update the per-tag height registry consumed by the AprilTag
service. The calibration UI uses this so an operator can dial in the
exact mount height of the robot tag (and, if they ever raise the
corner tags onto risers, the corner heights too).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, RootModel

from app.services.tag_heights_store import tag_heights_store

router = APIRouter(prefix="/api/apriltag", tags=["apriltag"])


class TagHeightsResponse(RootModel[dict[str, float]]):
    """JSON object keyed by stringified tag id → height in mm."""


class TagHeightsUpdate(BaseModel):
    """Partial update — only the tag ids supplied are touched.
    Missing ids keep their stored value."""

    heights: dict[int, float] = Field(default_factory=dict)


def _serialise(heights: dict[int, float]) -> dict[str, float]:
    return {str(k): v for k, v in heights.items()}


@router.get("/tag-heights", response_model=TagHeightsResponse)
def get_tag_heights() -> TagHeightsResponse:
    return TagHeightsResponse(root=_serialise(tag_heights_store.all()))


@router.put("/tag-heights", response_model=TagHeightsResponse)
def set_tag_heights(payload: TagHeightsUpdate) -> TagHeightsResponse:
    if not payload.heights:
        raise HTTPException(status_code=400, detail="No heights to update")
    # Clamp to a sane range so a typo can't poison back-projection.
    # 0 mm = on the canvas, 500 mm = an unusually tall riser; refuse
    # anything outside that window.
    for tag_id, mm in payload.heights.items():
        if not (0.0 <= mm <= 500.0):
            raise HTTPException(
                status_code=400,
                detail=f"tag {tag_id} height {mm}mm out of range [0, 500]",
            )
    updated = tag_heights_store.update(payload.heights)
    return TagHeightsResponse(root=_serialise(updated))
