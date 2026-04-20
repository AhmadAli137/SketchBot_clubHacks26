from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services import supabase_client as sb

logger = logging.getLogger("sketchbot.progress")
router = APIRouter(prefix="/api/progress", tags=["progress"])

_DATA_PATH = Path(os.environ.get("SKETCHBOT_DATA_DIR") or (Path(__file__).parents[2] / "data")) / "classroom-progress.json"
_lock = threading.Lock()


class ProgressSyncRequest(BaseModel):
    student_name: str
    xp: int = Field(default=0, ge=0)
    level: int = Field(default=1, ge=1)
    level_name: str = "Doodler"
    level_emoji: str = ""
    badge_count: int = Field(default=0, ge=0)
    streak_days: int = Field(default=0, ge=0)
    drawings_count: int = Field(default=0, ge=0)
    concepts_started: int = Field(default=0, ge=0)
    concepts_mastered: int = Field(default=0, ge=0)
    session_id: str | None = None
    concept_id: str | None = None


def _load_store() -> dict:
    try:
        if _DATA_PATH.exists():
            return json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {"students": {}}


def _save_store(store: dict) -> None:
    _DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    _DATA_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")


@router.post("/sync")
async def sync_progress(req: ProgressSyncRequest) -> dict:
    """Student posts their progress summary for the classroom leaderboard."""
    row = {
        "student_name": req.student_name,
        "xp": req.xp,
        "level": req.level,
        "level_name": req.level_name,
        "level_emoji": req.level_emoji,
        "badge_count": req.badge_count,
        "streak_days": req.streak_days,
        "drawings_count": req.drawings_count,
        "concepts_started": req.concepts_started,
        "concepts_mastered": req.concepts_mastered,
    }

    # Mirror to Supabase student_progress when configured
    sb_row: dict = {
        "student_name": req.student_name,
        "xp_earned": req.xp,
        "drawings_count": req.drawings_count,
        "steps_completed": req.concepts_started,
    }
    if req.session_id:
        sb_row["session_id"] = req.session_id
    if req.concept_id:
        sb_row["concept_id"] = req.concept_id
    sb.push_row("student_progress", sb_row)

    with _lock:
        store = _load_store()
        store.setdefault("students", {})[req.student_name] = row
        _save_store(store)
    return {"ok": True}


@router.get("/leaderboard")
async def get_leaderboard() -> dict:
    """Return all synced students sorted by XP descending."""
    with _lock:
        store = _load_store()
    students = list(store.get("students", {}).values())
    students.sort(key=lambda s: s.get("xp", 0), reverse=True)

    for i, s in enumerate(students):
        s["rank"] = i + 1

    return {"leaderboard": students}


@router.get("/{student_name}")
async def get_student_progress(student_name: str) -> dict:
    """Get a single student's synced progress."""
    with _lock:
        store = _load_store()
    entry = store.get("students", {}).get(student_name)
    if not entry:
        return {"found": False}
    return {"found": True, **entry}
