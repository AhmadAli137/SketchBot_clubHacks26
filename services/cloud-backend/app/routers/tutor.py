from __future__ import annotations

import json
import os
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.auth import require_auth
from app.core.settings import settings
from app.routers.subscriptions import check_credits, deduct_credits
from app.services.tutor_service import tutor_service

router = APIRouter(prefix="/api/tutor", tags=["tutor"])

AuthUser = Annotated[dict, Depends(require_auth)]


# ─── Tutor chat (SSE streaming) ───────────────────────────────────────────────

class TutorMessageRequest(BaseModel):
    student_name: str = ""
    age_group: str = "builder"
    actor_role: str = "student"
    trigger: str
    concept_id: str = "free-draw"
    layer: str = "intuitive"
    student_message: str = ""
    drawing_prompt: str = ""
    path_count: int = 0
    # Optional situational-awareness preamble built by the renderer's
    # spark-context module. Rendered server-side as an uncached system
    # block. See docs/privacy-tutor-observe.md.
    context_text: str = ""


class TutorObserveRequest(BaseModel):
    """Tick-driven observation. Most responses are {speak: false}."""
    student_name: str = ""
    age_group: str = "builder"
    actor_role: str = "student"
    concept_id: str = "free-draw"
    layer: str = "intuitive"
    context_text: str = ""


class TutorSummarizeRequest(BaseModel):
    """End-of-session reflection. Stored client-side as cross-session memory."""
    student_name: str = ""
    age_group: str = "builder"
    actor_role: str = "student"
    concept_id: str = "free-draw"
    layer: str = "intuitive"
    context_text: str = ""
    chat_excerpt: str = ""
    duration_sec: int = 0


@router.post("/message")
async def tutor_message(body: TutorMessageRequest, user: AuthUser):
    # Credit gate: check before streaming
    has_credits, remaining = check_credits(user["id"])
    if not has_credits:
        async def no_credits():
            yield f"data: {json.dumps({'type': 'error', 'message': f'You have used all your AI credits for this month (0 remaining). Upgrade your plan at sayspark.ca/pricing to continue.'})}\n\n"
        return StreamingResponse(no_credits(), media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    user_id = user["id"]

    async def event_stream():
        tokens_sent = 0
        try:
            async for chunk in tutor_service.stream_message(
                student_name=body.student_name,
                age_group=body.age_group,
                actor_role=body.actor_role,
                trigger=body.trigger,
                concept_id=body.concept_id,
                layer=body.layer,
                student_message=body.student_message,
                drawing_prompt=body.drawing_prompt,
                path_count=body.path_count,
                context_text=body.context_text,
            ):
                # stream_message yields strings for text deltas and dicts
                # for structured events (tool_request). Forward each as
                # the matching SSE type so the renderer can handle both.
                if isinstance(chunk, str):
                    tokens_sent += 1
                    yield f"data: {json.dumps({'type': 'token', 'text': chunk})}\n\n"
                elif isinstance(chunk, dict):
                    yield f"data: {json.dumps(chunk)}\n\n"
            # Deduct 1 credit per successful tutor interaction
            deduct_credits(user_id, 1)
            yield f"data: {json.dumps({'type': 'done', 'credits_remaining': max(0, remaining - 1)})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable Nginx buffering on Render
        },
    )


# ─── Evaluate drawing ─────────────────────────────────────────────────────────

class TutorEvaluateRequest(BaseModel):
    student_name: str = ""
    age_group: str = "builder"
    actor_role: str = "student"
    concept_id: str = "free-draw"
    layer: str = "intuitive"
    drawing_prompt: str = ""
    path_count: int = 0


@router.post("/observe")
async def tutor_observe(body: TutorObserveRequest, user: AuthUser):
    """
    Tick-driven situational observation. The renderer ships its current
    SparkContext (rendered as natural-language text); the tutor decides
    whether to speak and/or call a tool. Returns:
        { speak: bool, message: str, tool_request?: {...} }

    Credit policy: silent ticks are FREE (most ticks are silent and a
    typical session would burn ~50 credits if we charged per tick).
    Charge 1 credit only when the tutor either spoke or invoked a tool —
    those are the outcomes that produce real student-facing value.
    """
    has_credits, _remaining = check_credits(user["id"])
    if not has_credits:
        # No credits → just stay silent. Don't surface an error on a
        # background tick; the user will see the credit warning the next
        # time they actually invoke the tutor on purpose.
        return {"speak": False, "message": ""}

    result = await tutor_service.observe(
        student_name=body.student_name,
        age_group=body.age_group,
        actor_role=body.actor_role,
        concept_id=body.concept_id,
        layer=body.layer,
        context_text=body.context_text,
    )

    spoke = bool(result.get("speak") and result.get("message"))
    used_tool = bool(result.get("tool_request"))
    if spoke or used_tool:
        deduct_credits(user["id"], 1)

    return result


@router.get("/observe-stats")
async def tutor_observe_stats(_user: AuthUser):
    """Aggregate counters for cost / quality monitoring (no payload contents)."""
    return tutor_service.get_observe_counters()


@router.post("/summarize")
async def tutor_summarize(body: TutorSummarizeRequest, user: AuthUser):
    """End-of-session reflection. Always charges 1 credit since it always
    produces a real response (no silent path here, unlike /observe)."""
    has_credits, _remaining = check_credits(user["id"])
    if not has_credits:
        return {"summary": "", "sentiment": "neutral"}
    result = await tutor_service.summarize(
        student_name=body.student_name,
        age_group=body.age_group,
        actor_role=body.actor_role,
        concept_id=body.concept_id,
        layer=body.layer,
        context_text=body.context_text,
        chat_excerpt=body.chat_excerpt,
        duration_sec=body.duration_sec,
    )
    if result.get("summary"):
        deduct_credits(user["id"], 1)
    return result


@router.post("/evaluate")
async def tutor_evaluate(body: TutorEvaluateRequest, _user: AuthUser):
    result = await tutor_service.evaluate(
        student_name=body.student_name,
        age_group=body.age_group,
        actor_role=body.actor_role,
        concept_id=body.concept_id,
        layer=body.layer,
        drawing_prompt=body.drawing_prompt,
        path_count=body.path_count,
    )
    return result


# ─── Text-to-speech proxy ─────────────────────────────────────────────────────

_OPENAI_TTS_VOICES = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}
_ELEVENLABS_VOICE_ALIASES = {
    "mark": "UgBBYS2sOqTuMpoF3BR0",
    "lori": "TbMNBJ27fH2U0VgpSNko",
}


class TutorSpeakRequest(BaseModel):
    text: str
    voice: str = "mark"
    provider: str | None = None
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    stability: float = Field(default=0.5, ge=0.0, le=1.0)
    similarity_boost: float = Field(default=0.8, ge=0.0, le=1.0)
    style: float = Field(default=0.0, ge=0.0, le=1.0)


def _resolve_tts_provider(req: TutorSpeakRequest) -> tuple[str, str]:
    raw = (req.voice or "").strip()
    alias = _ELEVENLABS_VOICE_ALIASES.get(raw.lower())
    has_el = bool(settings.elevenlabs_api_key)

    if req.provider == "elevenlabs":
        return "elevenlabs", alias or raw
    if req.provider == "openai":
        return "openai", raw or "alloy"
    if raw.lower() in _OPENAI_TTS_VOICES:
        return "openai", raw.lower()
    if alias:
        return "elevenlabs", alias
    if has_el and raw:
        return "elevenlabs", raw
    return "openai", raw or "alloy"


@router.post("/speak")
async def tutor_speak(req: TutorSpeakRequest, _user: AuthUser):
    provider, voice = _resolve_tts_provider(req)

    if provider == "elevenlabs":
        return await _tts_elevenlabs(req, voice)
    return await _tts_openai(req, voice)


@router.get("/voices")
async def tutor_voices(_user: AuthUser):
    el_ready = bool(settings.elevenlabs_api_key)
    oa_ready = bool(settings.openai_api_key)
    return {
        "elevenlabs_ready": el_ready,
        "openai_ready": oa_ready,
        "voices": [
            {"id": "mark", "name": "Mark", "provider": "elevenlabs", "available": el_ready},
            {"id": "lori", "name": "Lori", "provider": "elevenlabs", "available": el_ready},
            {"id": "alloy", "name": "Alloy", "provider": "openai", "available": oa_ready},
            {"id": "nova", "name": "Nova", "provider": "openai", "available": oa_ready},
        ],
    }


async def _tts_elevenlabs(req: TutorSpeakRequest, voice_id: str) -> StreamingResponse:
    import httpx

    api_key = settings.elevenlabs_api_key
    if not api_key:
        return JSONResponse({"error": "ElevenLabs not configured"}, status_code=503)

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
    payload = {
        "text": req.text,
        "model_id": settings.elevenlabs_model_id,
        "voice_settings": {
            "stability": req.stability,
            "similarity_boost": req.similarity_boost,
            "style": req.style,
            "use_speaker_boost": True,
        },
    }
    headers = {"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"}

    client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))
    try:
        request = client.build_request("POST", url, json=payload, headers=headers)
        response = await client.send(request, stream=True)
    except httpx.HTTPError as exc:
        await client.aclose()
        return JSONResponse({"error": f"ElevenLabs request failed: {exc}"}, status_code=502)

    if response.status_code >= 400:
        body = (await response.aread()).decode(errors="replace")
        await response.aclose()
        await client.aclose()
        return JSONResponse(
            {"error": "ElevenLabs error", "status": response.status_code, "detail": body[:500]},
            status_code=min(response.status_code, 599),
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
        headers={"X-TTS-Provider": "elevenlabs", "X-TTS-Voice": voice_id},
    )


async def _tts_openai(req: TutorSpeakRequest, voice: str) -> StreamingResponse:
    import httpx

    api_key = settings.openai_api_key
    if not api_key:
        return JSONResponse({"error": "OpenAI TTS not configured"}, status_code=503)

    url = "https://api.openai.com/v1/audio/speech"
    payload = {"model": "tts-1", "input": req.text, "voice": voice, "speed": req.speed}
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))
    try:
        request = client.build_request("POST", url, json=payload, headers=headers)
        response = await client.send(request, stream=True)
    except httpx.HTTPError as exc:
        await client.aclose()
        return JSONResponse({"error": f"OpenAI request failed: {exc}"}, status_code=502)

    if response.status_code >= 400:
        body = (await response.aread()).decode(errors="replace")
        await response.aclose()
        await client.aclose()
        return JSONResponse({"error": "OpenAI TTS error", "detail": body[:500]}, status_code=502)

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
        headers={"X-TTS-Provider": "openai", "X-TTS-Voice": voice},
    )
