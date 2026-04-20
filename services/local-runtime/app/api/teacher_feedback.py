from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/teacher-feedback", tags=["teacher-feedback"])

_DATA_PATH = Path(os.environ.get("SKETCHBOT_DATA_DIR") or (Path(__file__).parents[2] / "data")) / "teacher_feedback.jsonl"
_lock = threading.Lock()

_DEFAULT_DEV_EMAIL = "hello@sketchbot.app"


def _developer_email() -> str:
    return (os.environ.get("DEVELOPER_CONTACT_EMAIL") or "").strip() or _DEFAULT_DEV_EMAIL


class TeacherFeedbackBody(BaseModel):
    category: str = Field(default="other", max_length=64)
    subject: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=20_000)
    contact_email: str = Field(default="", max_length=320)
    teacher_name: str = Field(default="", max_length=200)
    classroom_name: str = Field(default="", max_length=200)
    client_hint: str = Field(default="", max_length=500)


@router.get("/config")
async def feedback_config() -> dict:
    """Public config for desktop UI (mailto target, etc.)."""
    return {"developer_email": _developer_email()}


@router.post("/submit")
async def submit_feedback(body: TeacherFeedbackBody) -> dict:
    """
    Append one feedback record to local JSONL (classroom hub).
    Teachers should also use mailto for inquiries that must reach humans directly.
    """
    row = {
        "received_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "category": body.category.strip(),
        "subject": body.subject.strip(),
        "message": body.message.strip(),
        "contact_email": body.contact_email.strip(),
        "teacher_name": body.teacher_name.strip(),
        "classroom_name": body.classroom_name.strip(),
        "client_hint": body.client_hint.strip(),
    }
    line = json.dumps(row, ensure_ascii=False) + "\n"
    with _lock:
        _DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        with _DATA_PATH.open("a", encoding="utf-8") as f:
            f.write(line)
    return {"ok": True, "stored": True}
