from __future__ import annotations

import json
import os
import tempfile

from fastapi import APIRouter, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.tutor_service import tutor_service

router = APIRouter(prefix="/api/tutor", tags=["tutor"])


# ─── Request models ───────────────────────────────────────────────────────────

class TutorMessageRequest(BaseModel):
    student_name: str = "Student"
    age_group: str = "builder"          # explorer | builder | engineer
    trigger: str = "student_reply"      # concept_change | drawing_submitted | student_reply | hint_request | layer_change
    concept_id: str = "free-draw"
    layer: str = "intuitive"            # intuitive | structural | precise
    student_message: str = ""
    drawing_prompt: str = ""
    path_count: int = Field(default=0, ge=0)


class TutorEvaluateRequest(BaseModel):
    student_name: str = "Student"
    age_group: str = "builder"
    concept_id: str = "free-draw"
    layer: str = "intuitive"
    drawing_prompt: str = ""
    path_count: int = Field(default=0, ge=0)


class TutorClearRequest(BaseModel):
    student_name: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/message")
async def tutor_message(req: TutorMessageRequest) -> StreamingResponse:
    """
    Stream a tutor response as Server-Sent Events.

    Protocol: each event is   data: <json_string>\\n\\n
    where the JSON is one of:
      {"type": "token", "text": "<chunk>"}   — a streamed text chunk
      {"type": "done"}                        — stream complete
      {"type": "error", "message": "..."}    — error occurred

    Using JSON-encoded events means newlines inside Claude's response
    survive the SSE transport unchanged.
    """

    async def generate():
        try:
            async for token in tutor_service.stream_message(
                student_name=req.student_name,
                age_group=req.age_group,
                trigger=req.trigger,
                concept_id=req.concept_id,
                layer=req.layer,
                student_message=req.student_message,
                drawing_prompt=req.drawing_prompt,
                path_count=req.path_count,
            ):
                payload = json.dumps({"type": "token", "text": token})
                yield f"data: {payload}\n\n"
        except Exception as exc:  # noqa: BLE001
            error_payload = json.dumps({"type": "error", "message": str(exc)})
            yield f"data: {error_payload}\n\n"
        finally:
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/evaluate")
async def tutor_evaluate(req: TutorEvaluateRequest) -> dict:
    """
    Non-streaming: evaluate whether a student's drawing demonstrates
    concept mastery for the active layer.
    Returns: { passed: bool, feedback: str, suggest_next_layer: bool }
    """
    return await tutor_service.evaluate(
        student_name=req.student_name,
        age_group=req.age_group,
        concept_id=req.concept_id,
        layer=req.layer,
        drawing_prompt=req.drawing_prompt,
        path_count=req.path_count,
    )


@router.post("/clear-session")
async def tutor_clear_session(req: TutorClearRequest) -> dict:
    """Clear all conversation history for a student (e.g., on logout or session reset)."""
    tutor_service.clear_student_sessions(req.student_name)
    return {"ok": True}


@router.get("/status")
def tutor_status() -> dict:
    """Check whether the Anthropic API key is configured."""
    return {"available": tutor_service.is_available()}


@router.post("/transcribe")
async def tutor_transcribe(audio: UploadFile = File(...)) -> dict:
    """
    Transcribe voice input using OpenAI Whisper.
    Accepts any audio format MediaRecorder produces (webm, ogg, etc.).
    Returns: { text: str }
    """
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return {"text": ""}

    try:
        import openai
        client = openai.AsyncOpenAI(api_key=api_key)

        audio_bytes = await audio.read()
        suffix = ".webm"
        if audio.filename:
            suffix = "." + audio.filename.rsplit(".", 1)[-1]

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as f:
                result = await client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                    language="en",
                )
            return {"text": result.text}
        finally:
            os.unlink(tmp_path)

    except Exception as exc:  # noqa: BLE001
        return {"text": "", "error": str(exc)}
