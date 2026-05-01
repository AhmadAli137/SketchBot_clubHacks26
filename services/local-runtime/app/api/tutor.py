from __future__ import annotations

import json
import logging
import os
import tempfile
import traceback

from fastapi import APIRouter, UploadFile, File

logger = logging.getLogger("sketchbot.tutor")
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services import tutor_supabase_sync
from app.services.tutor_audit_log import supabase_outbox_pending_count
from app.services.tutor_service import tutor_service

router = APIRouter(prefix="/api/tutor", tags=["tutor"])


# ─── Request models ───────────────────────────────────────────────────────────

class TutorMessageRequest(BaseModel):
    student_name: str = "Student"
    age_group: str = "builder"          # explorer | builder | engineer
    actor_role: str = "student"         # student | teacher
    trigger: str = "student_reply"      # concept_change | drawing_submitted | student_reply | hint_request | layer_change | teacher_reply | teacher_hint_request
    concept_id: str = "free-draw"
    layer: str = "intuitive"            # intuitive | structural | precise
    student_message: str = ""
    drawing_prompt: str = ""
    path_count: int = Field(default=0, ge=0)
    # Optional situational-awareness preamble (rendered server-side as an
    # uncached system block). When omitted the tutor falls back to its
    # legacy behaviour. See lib/spark-context.ts on the renderer side.
    context_text: str = ""


class TutorObserveRequest(BaseModel):
    """Tick-driven observation. The tutor decides whether to speak at all."""
    student_name: str = "Student"
    age_group: str = "builder"
    actor_role: str = "student"
    concept_id: str = "free-draw"
    layer: str = "intuitive"
    context_text: str = ""


class TutorEvaluateRequest(BaseModel):
    student_name: str = "Student"
    age_group: str = "builder"
    actor_role: str = "student"
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
                actor_role=req.actor_role,
                trigger=req.trigger,
                concept_id=req.concept_id,
                layer=req.layer,
                student_message=req.student_message,
                drawing_prompt=req.drawing_prompt,
                path_count=req.path_count,
                context_text=req.context_text,
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
    Returns: { passed, score, creativity, concept_alignment, complexity, feedback, suggest_next_layer }
    """
    return await tutor_service.evaluate(
        student_name=req.student_name,
        age_group=req.age_group,
        actor_role=req.actor_role,
        concept_id=req.concept_id,
        layer=req.layer,
        drawing_prompt=req.drawing_prompt,
        path_count=req.path_count,
    )


@router.post("/observe")
async def tutor_observe(req: TutorObserveRequest) -> dict:
    """
    Tick-driven situational observation. The renderer ships its current
    SparkContext (rendered as natural-language text); the tutor decides
    whether to speak. Returns ``{speak: bool, message: str}``.

    When ``speak`` is False the renderer should not display anything —
    that's the intended common case.
    """
    return await tutor_service.observe(
        student_name=req.student_name,
        age_group=req.age_group,
        actor_role=req.actor_role,
        concept_id=req.concept_id,
        layer=req.layer,
        context_text=req.context_text,
    )


@router.post("/clear-session")
async def tutor_clear_session(req: TutorClearRequest) -> dict:
    """Clear all conversation history for a student (e.g., on logout or session reset)."""
    tutor_service.clear_student_sessions(req.student_name)
    return {"ok": True}


@router.get("/status")
def tutor_status() -> dict:
    """Anthropic availability + Supabase sync diagnostics (see docs/supabase-tutor-audit.md).

    Also surfaces aggregate counters for the agentic observe loop — pure counts,
    no payload contents, suitable for cost / quality monitoring (see
    docs/privacy-tutor-observe.md).
    """
    return {
        "available": tutor_service.is_available(),
        "supabase_sync": {
            "configured": tutor_supabase_sync.is_configured(),
            "outbox_pending": supabase_outbox_pending_count(),
        },
        "observe": tutor_service.get_observe_counters(),
    }


# ─── Text-to-speech ──────────────────────────────────────────────────────────
#
# Providers supported:
#   • ElevenLabs (preferred when ELEVENLABS_API_KEY is set) — used for kid-
#     friendly character voices like "Mark" and "Lori" via voice IDs.
#   • OpenAI TTS (fallback) — uses built-in voice names (alloy, echo, ...).

# OpenAI's built-in voice palette. Any `voice` value in this set routes to
# OpenAI regardless of whether ElevenLabs is configured.
_OPENAI_TTS_VOICES = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}

# Convenience aliases → ElevenLabs voice IDs.
# These are the two character voices exposed to students in the UI.
_ELEVENLABS_VOICE_ALIASES: dict[str, str] = {
    "mark": "UgBBYS2sOqTuMpoF3BR0",
    "lori": "TbMNBJ27fH2U0VgpSNko",
}


class TutorSpeakRequest(BaseModel):
    text: str
    # Voice identifier. May be:
    #   • an ElevenLabs voice ID (20-char id)
    #   • an alias ("mark", "lori")
    #   • an OpenAI voice name (alloy | echo | fable | onyx | nova | shimmer)
    voice: str = "mark"
    # Optional explicit provider override: "elevenlabs" | "openai"
    provider: str | None = None
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    # ElevenLabs voice settings (ignored for OpenAI).
    stability: float = Field(default=0.5, ge=0.0, le=1.0)
    similarity_boost: float = Field(default=0.8, ge=0.0, le=1.0)
    style: float = Field(default=0.0, ge=0.0, le=1.0)


def _resolve_tts_provider(req: TutorSpeakRequest) -> tuple[str, str]:
    """Return (provider, resolved_voice) for a speech request.

    Resolution order:
      1. Explicit `provider` field wins.
      2. Voice in OpenAI palette → openai.
      3. ELEVENLABS_API_KEY present → elevenlabs.
      4. Fallback → openai.
    """
    raw = (req.voice or "").strip()
    alias = _ELEVENLABS_VOICE_ALIASES.get(raw.lower())
    has_elevenlabs = bool(os.environ.get("ELEVENLABS_API_KEY", ""))

    if req.provider == "elevenlabs":
        return "elevenlabs", alias or raw
    if req.provider == "openai":
        return "openai", raw or "alloy"
    if raw.lower() in _OPENAI_TTS_VOICES:
        return "openai", raw.lower()
    if alias:
        return "elevenlabs", alias
    if has_elevenlabs and raw:
        return "elevenlabs", raw
    return "openai", raw or "alloy"


async def _tts_elevenlabs(req: TutorSpeakRequest, voice_id: str) -> StreamingResponse:
    """Stream MP3 audio from the ElevenLabs text-to-speech REST API."""
    import httpx
    from fastapi.responses import JSONResponse

    api_key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not api_key:
        return JSONResponse(
            {"error": "ELEVENLABS_API_KEY not configured"}, status_code=503
        )

    model_id = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": req.text,
        "model_id": model_id,
        "voice_settings": {
            "stability": req.stability,
            "similarity_boost": req.similarity_boost,
            "style": req.style,
            "use_speaker_boost": True,
        },
    }

    client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))

    try:
        request = client.build_request("POST", url, json=payload, headers=headers)
        response = await client.send(request, stream=True)
    except httpx.HTTPError as exc:
        await client.aclose()
        return JSONResponse({"error": f"elevenlabs request failed: {exc}"}, status_code=502)

    if response.status_code >= 400:
        body = (await response.aread()).decode(errors="replace")
        await response.aclose()
        await client.aclose()
        return JSONResponse(
            {"error": "elevenlabs error", "status": response.status_code, "detail": body[:500]},
            status_code=response.status_code if response.status_code < 600 else 502,
        )

    async def stream_audio():
        try:
            async for chunk in response.aiter_bytes(4096):
                if chunk:
                    yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_audio(),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "X-TTS-Provider": "elevenlabs",
            "X-TTS-Voice": voice_id,
        },
    )


async def _tts_openai(req: TutorSpeakRequest, voice: str) -> StreamingResponse:
    """Stream MP3 audio from OpenAI's TTS endpoint."""
    from fastapi.responses import JSONResponse

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return JSONResponse({"error": "OPENAI_API_KEY not configured"}, status_code=503)

    try:
        import openai
        client = openai.AsyncOpenAI(api_key=api_key)

        response = await client.audio.speech.create(
            model="tts-1",
            voice=voice if voice in _OPENAI_TTS_VOICES else "alloy",
            input=req.text,
            speed=req.speed,
            response_format="mp3",
        )

        async def stream_audio():
            async for chunk in response.response.aiter_bytes(1024):
                yield chunk

        return StreamingResponse(
            stream_audio(),
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "public, max-age=86400",
                "X-TTS-Provider": "openai",
                "X-TTS-Voice": voice,
            },
        )

    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"error": str(exc)}, status_code=500)


@router.post("/speak")
async def tutor_speak(req: TutorSpeakRequest) -> StreamingResponse:
    """Generate speech audio. Routes to ElevenLabs or OpenAI based on voice/provider."""
    provider, resolved_voice = _resolve_tts_provider(req)
    if provider == "elevenlabs":
        return await _tts_elevenlabs(req, resolved_voice)
    return await _tts_openai(req, resolved_voice)


@router.get("/voices")
def tutor_voices() -> dict:
    """List voice options exposed to the UI."""
    elevenlabs_ready = bool(os.environ.get("ELEVENLABS_API_KEY", ""))
    openai_ready = bool(os.environ.get("OPENAI_API_KEY", ""))
    return {
        "elevenlabs_ready": elevenlabs_ready,
        "openai_ready": openai_ready,
        "voices": [
            {
                "id": "UgBBYS2sOqTuMpoF3BR0",
                "alias": "mark",
                "label": "Mark",
                "description": "Friendly, upbeat guy voice",
                "provider": "elevenlabs",
                "available": elevenlabs_ready,
            },
            {
                "id": "TbMNBJ27fH2U0VgpSNko",
                "alias": "lori",
                "label": "Lori",
                "description": "Warm, encouraging woman voice",
                "provider": "elevenlabs",
                "available": elevenlabs_ready,
            },
        ],
    }


@router.get("/transcribe/status")
def tutor_transcribe_status() -> dict:
    """Whether server-side (OpenAI Whisper) transcription is available."""
    return {"available": bool(os.environ.get("OPENAI_API_KEY", ""))}


@router.post("/transcribe")
async def tutor_transcribe(audio: UploadFile = File(...)):
    """
    Transcribe voice input using OpenAI Whisper.
    Accepts any audio format MediaRecorder produces (webm, ogg, etc.).
    Returns 503 when OPENAI_API_KEY is not configured so the client
    can gracefully fall back to local transcription.
    """
    from fastapi.responses import JSONResponse

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return JSONResponse(
            {
                "error": "OPENAI_API_KEY not configured",
                "text": "",
                "fallback": "local",
            },
            status_code=503,
        )

    try:
        import openai
        client = openai.AsyncOpenAI(api_key=api_key)

        audio_bytes = await audio.read()
        suffix = ".webm"
        if audio.filename and "." in audio.filename:
            suffix = "." + audio.filename.rsplit(".", 1)[-1].lower()
        # Whisper accepts: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac.
        if suffix not in {".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg", ".flac"}:
            suffix = ".webm"

        logger.info(
            "tutor.transcribe: filename=%s content_type=%s bytes=%d suffix=%s",
            audio.filename, audio.content_type, len(audio_bytes), suffix,
        )

        if len(audio_bytes) < 128:
            # Browser sometimes fires onstop with essentially no data.
            return {"text": ""}

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
            text = getattr(result, "text", "") or ""
            logger.info("tutor.transcribe: ok chars=%d", len(text))
            return {"text": text}
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    except Exception as exc:  # noqa: BLE001
        logger.error("tutor.transcribe failed: %s\n%s", exc, traceback.format_exc())
        return JSONResponse(
            {"text": "", "error": f"{type(exc).__name__}: {exc}"},
            status_code=500,
        )
