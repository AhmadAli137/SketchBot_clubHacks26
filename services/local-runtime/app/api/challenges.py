from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/api/challenges", tags=["challenges"])

_LOCAL_DATA = Path(__file__).parents[3] / "cloud-backend" / "data" / "challenges.json"
_FALLBACK: dict = {"packs": []}


def _load() -> dict:
    try:
        return json.loads(_LOCAL_DATA.read_text(encoding="utf-8"))
    except Exception:
        return _FALLBACK


@router.get("")
def all_challenges() -> dict:
    return _load()


@router.get("/{robot_id}")
def challenges_for_robot(robot_id: str) -> dict:
    library = _load()
    packs = [p for p in library.get("packs", []) if p.get("robot_id") == robot_id]
    return {"packs": packs}
