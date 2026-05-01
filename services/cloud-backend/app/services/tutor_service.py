from __future__ import annotations

import json
import threading
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator

from app.core.settings import settings

try:
    import anthropic
except ModuleNotFoundError:
    anthropic = None  # type: ignore[assignment]

# ─── Personas ─────────────────────────────────────────────────────────────────

TTS_SPOKEN_CHAR_BUDGET = 380

_OUTPUT_CHANNELS = f"""\
OUTPUT CHANNELS (critical — follow every time):
1) First, write the **spoken** part: friendly, concise, 1–3 short sentences (plus optional quick prompts or one short question).
2) Then a single line containing exactly three hyphens: ---
3) After that line, put **written-only** content: longer explanations, numbered steps, bullet lists, math, or anything lengthy.

HARD LIMIT: The spoken section (before ---), measured as plain text with markdown stripped, must stay at or under **{TTS_SPOKEN_CHAR_BUDGET} characters**.
Never put long explanations before the --- line.
Do not mention "---", "TTS", "spoken layer", "character limit", or "voice API" to the student.\
"""

_PERSONA_EXPLORER = """\
You are Sketch, a warm and enthusiastic robot tutor for kids aged 6–10.
Speak simply — short sentences, big ideas, zero jargon.
Use analogies to everyday things (games, animals, toys, cartoons).
Ask ONE question at a time. Celebrate every small discovery.
Use the occasional emoji 🤖✏️🎉 to stay fun (but not every sentence).
Never use words like "algorithm", "parameter", or "matrix" without immediately explaining them with a playful comparison.
Keep the **spoken** part (before ---) to at most 3 short sentences; put any longer walkthrough after ---.
You have memory of the full conversation above — refer back to what the student said and what you drew together.

""" + _OUTPUT_CHANNELS

_PERSONA_BUILDER = """\
You are Sketch, an energetic and knowledgeable robot tutor for students aged 11–14.
Use a slightly technical vocabulary — words like "coordinates", "loop", "variable", "sensor", "feedback", "vector" are fine.
Connect ideas to things students care about: games, sports, music, design.
Be encouraging but honest. Use Socratic questions to guide discovery rather than giving answers directly.
Reference how the physical robot works to ground abstract ideas.
Keep the **spoken** part (before ---) brief (about 2–4 short sentences); put step-by-step detail, lists, and deep dives after ---.
You have memory of the full conversation above — build on what was said, don't repeat yourself.

""" + _OUTPUT_CHANNELS

_PERSONA_ENGINEER = """\
You are Sketch, a precise and knowledgeable robotics mentor for students aged 15+.
Speak at near-peer level. Use proper technical vocabulary freely: kinematics, homography, PID, parametric equations, control theory, linear algebra, Jacobian.
Express math in plain text or Unicode — for example: x(t) = cx + r·cos(t), not LaTeX dollar-sign notation.
Reference real engineering systems (CNC machines, autonomous vehicles, satellite attitude control).
Be concise in the **spoken** part (before ---); put proofs, long derivations, and multi-step analysis after ---.
You have memory of the full conversation above — be consistent, build depth across turns, avoid repeating prior explanations.

""" + _OUTPUT_CHANNELS

_PERSONAS = {
    "explorer": _PERSONA_EXPLORER,
    "builder": _PERSONA_BUILDER,
    "engineer": _PERSONA_ENGINEER,
}

# ─── Session store (in-memory, per cloud instance) ────────────────────────────

MAX_HISTORY_TURNS = 10


@dataclass
class _TutorSession:
    history: list[dict] = field(default_factory=list)
    last_layer: str = "intuitive"


_sessions: dict[str, _TutorSession] = {}
_sessions_lock = threading.Lock()


def _session_key(student_name: str, concept_id: str, *, actor_role: str = "student") -> str:
    role = "teacher" if actor_role == "teacher" else "student"
    return f"{role}:{student_name}::{concept_id}"


def _get_session(student_name: str, concept_id: str, *, actor_role: str = "student") -> _TutorSession:
    key = _session_key(student_name, concept_id, actor_role=actor_role)
    with _sessions_lock:
        if key not in _sessions:
            _sessions[key] = _TutorSession()
        return _sessions[key]


def _trim_history(history: list[dict]) -> list[dict]:
    max_msgs = MAX_HISTORY_TURNS * 2
    return history[-max_msgs:] if len(history) > max_msgs else history


# ─── Concepts loader ──────────────────────────────────────────────────────────
# concepts.json lives alongside the cloud-backend code in data/

_CONCEPTS_PATH = Path(__file__).parents[2] / "data" / "concepts.json"
_concepts_cache: list[dict] | None = None


def _load_concepts() -> list[dict]:
    global _concepts_cache
    if _concepts_cache is None:
        try:
            _concepts_cache = json.loads(_CONCEPTS_PATH.read_text(encoding="utf-8"))
        except Exception:
            _concepts_cache = []
    return _concepts_cache


def _get_concept(concept_id: str) -> dict | None:
    for c in _load_concepts():
        if c.get("concept_id") == concept_id:
            return c
    return None


# ─── Response cache (in-memory LRU only — no disk on cloud) ──────────────────

_CACHE_MAX = 256
_CACHE_TTL = 86400 * 7  # 7 days

import hashlib
import time

_stream_lru: OrderedDict[str, tuple[float, str]] = OrderedDict()
_stream_lock = threading.Lock()


def _sha256(obj: Any) -> str:
    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()


def _lru_get(lru: OrderedDict, key: str, ttl: float) -> Any | None:
    if key not in lru:
        return None
    ts, val = lru[key]
    if time.time() - ts > ttl:
        del lru[key]
        return None
    lru.move_to_end(key)
    return val


def _lru_put(lru: OrderedDict, key: str, val: Any, max_entries: int) -> None:
    lru[key] = (time.time(), val)
    lru.move_to_end(key)
    while len(lru) > max_entries:
        lru.popitem(last=False)


# ─── Context builder ──────────────────────────────────────────────────────────

def _build_concept_context(concept_id: str, layer: str) -> str:
    concept = _get_concept(concept_id)
    if not concept:
        return f"Current concept: {concept_id} (no curriculum data), layer: {layer}."

    layer_data = concept.get("layers", {}).get(layer, {})
    lines = [
        f"Concept: {concept['title']} (ID: {concept_id})",
        f"Domain: {concept.get('domain', 'unknown')}",
        f"Description: {concept.get('description', '')}",
        f"Active layer: {layer}",
    ]
    if layer_data.get("tutor_intro"):
        lines.append(f"Layer introduction: {layer_data['tutor_intro']}")
    if layer_data.get("hook"):
        lines.append(f"Hook question to explore: {layer_data['hook']}")
    if layer_data.get("starter_prompt"):
        lines.append(f"Suggested starter activity: {layer_data['starter_prompt']}")
    if layer_data.get("math_notation"):
        lines.append(f"Core math for this layer: {layer_data['math_notation']}")
    for lname, ldata in concept.get("layers", {}).items():
        if lname != layer and ldata.get("hook"):
            lines.append(f"[{lname} layer hook — for reference]: {ldata['hook']}")
    return "\n".join(lines)


# ─── User message builder ─────────────────────────────────────────────────────

def _build_user_message(
    *,
    student_name: str,
    actor_role: str,
    trigger: str,
    layer: str,
    student_message: str,
    drawing_prompt: str,
    path_count: int,
) -> str:
    is_teacher = actor_role == "teacher"
    name = student_name or ("the teacher" if is_teacher else "the student")

    if trigger == "concept_change":
        who = "The teacher" if is_teacher else name
        return (
            f"{who} just opened this concept at the **{layer}** layer. "
            + (
                "Before ---: acknowledge their planning context in 1–3 short sentences. "
                "After ---: lesson moves, differentiation, timing, and assessment ideas."
                if is_teacher
                else "Before ---: a warm greeting in 1–3 short sentences, one hook question, and one quick starter idea. "
                "After ---: the fuller layer introduction, core idea, and any extra detail."
            )
        )
    if trigger == "drawing_submitted":
        segments_desc = f"{path_count} path segment(s)" if path_count > 0 else "no paths yet"
        return (
            f"{name} submitted a drawing. Prompt: \"{drawing_prompt}\". Result: {segments_desc}.\n\n"
            + (
                "Before ---: brief reaction (2–3 short sentences). "
                "After ---: fuller feedback, observations, and next-step ideas."
                if not is_teacher
                else "Before ---: brief reaction for the educator. After ---: class demo ideas and follow-up prompts."
            )
        )
    if trigger in ("hint_request", "teacher_hint_request"):
        parts = [f"{name} asked for a hint at the **{layer}** layer."]
        if drawing_prompt:
            parts.append(f'Their most recent drawing was: "{drawing_prompt}" ({path_count} path segment(s)).')
        else:
            parts.append("They haven't submitted a drawing yet.")
        parts.append(
            "Before ---: a short hint (1–2 sentences). After ---: optional extra clues."
        )
        return " ".join(parts)
    if trigger == "layer_change":
        return (
            f"{name} just moved to the **{layer}** layer. "
            + (
                "Before ---: one or two short sentences celebrating the move. "
                "After ---: what's new at this layer and the first challenge."
                if not is_teacher
                else "Before ---: one or two sentences on what changes pedagogically. After ---: deeper layer notes."
            )
        )
    if trigger in ("student_reply", "teacher_reply") and student_message:
        return (
            f"{name}: \"{student_message}\"\n\n"
            + (
                "Before ---: a direct, friendly answer in a few short sentences. "
                "After ---: longer explanations, math, lists, or multi-step answers."
                if not is_teacher
                else "Before ---: answer directly for an educator — concise. After ---: structured ideas or rubric language."
            )
        )
    return (
        f"{name} is interacting with you. Continue the session naturally, "
        "building on the conversation history above."
    )


# ─── Offline fallback ─────────────────────────────────────────────────────────

def _offline_message(student_name: str, age_group: str, concept_id: str, trigger: str) -> str:
    name = student_name or "there"
    concept = _get_concept(concept_id)
    title = concept.get("title", concept_id) if concept else concept_id

    if trigger == "hint_request":
        return "Here's a hint: try thinking about what shape the robot would need to trace to show this concept. Start simple — one line, one curve."
    if age_group == "explorer":
        return f"Hi {name}! I'm Sketch, your robot tutor! 🤖 Today we're exploring **{title}** together. Ready to make something awesome?"
    if age_group == "engineer":
        return f"Welcome, {name}. Let's dig into **{title}**. We'll start with the core abstraction and build toward the full mathematical model."
    return f"Hey {name}! Ready to level up? We're diving into **{title}** — this is where robotics gets really interesting. Let's start drawing."


# ─── TutorService ─────────────────────────────────────────────────────────────

class TutorService:
    # Aggregate observe-loop telemetry (no payload contents). Surfaced at
    # /api/tutor/status for cost / quality monitoring. See docs/privacy-tutor-observe.md.
    _observe_counters: dict = {"total": 0, "spoken": 0, "silent": 0, "error": 0, "tool_used": 0}

    # Agent tool schema — mirror of frontend lib/spark-tools.ts. The
    # renderer's dispatcher decides annotative vs mutative; the backend just
    # exposes these to Claude and forwards any tool_use block back.
    _OBSERVE_TOOLS: list[dict] = [
        {
            "name": "highlight_object",
            "description": (
                "Briefly highlight a single object on the canvas to draw the "
                "student's attention. Annotative — runs immediately, no "
                "confirmation. Use to point at something they built."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "object_id": {"type": "string", "description": "SceneObject id from the situational-awareness preamble."},
                    "reason": {"type": "string", "description": "Short note shown to the student."},
                },
                "required": ["object_id"],
            },
        },
        {
            "name": "award_xp",
            "description": (
                "Give the student a small XP boost for genuine effort or a "
                "creative move. Annotative. Use sparingly — at most a couple "
                "times per session — so it stays meaningful. Always provide "
                "a one-sentence reason that references what they actually did."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "amount": {"type": "number", "description": "5, 10, or 25."},
                    "reason": {"type": "string", "description": "Why they earned it."},
                },
                "required": ["amount", "reason"],
            },
        },
        {
            "name": "add_demo_object",
            "description": (
                "Drop a demonstration object onto the canvas to show the "
                "student what you mean. Mutative — the renderer will surface a "
                "Yes/No confirmation to the student before this runs. Use only "
                "when describing alone isn't clear."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["wall", "cone", "block", "sphere", "cylinder", "waypoint"],
                    },
                    "x": {"type": "number", "description": "World X in metres."},
                    "z": {"type": "number", "description": "World Z in metres."},
                    "reason": {"type": "string", "description": "What this demo is meant to teach."},
                },
                "required": ["type", "x", "z"],
            },
        },
    ]

    def __init__(self) -> None:
        self._client = (
            anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
            if anthropic is not None and settings.anthropic_api_key
            else None
        )

    def is_available(self) -> bool:
        return self._client is not None

    @classmethod
    def get_observe_counters(cls) -> dict:
        return dict(cls._observe_counters)

    async def stream_message(
        self,
        *,
        student_name: str,
        age_group: str,
        actor_role: str = "student",
        trigger: str,
        concept_id: str,
        layer: str,
        student_message: str = "",
        drawing_prompt: str = "",
        path_count: int = 0,
        context_text: str = "",
    ) -> AsyncIterator[str]:
        if self._client is None:
            yield _offline_message(student_name, age_group, concept_id, trigger)
            return

        session = _get_session(student_name, concept_id, actor_role=actor_role)
        if trigger == "concept_change":
            session.history.clear()
            session.last_layer = layer
        elif layer != session.last_layer:
            session.last_layer = layer

        persona = _PERSONAS.get(age_group, _PERSONA_BUILDER)
        concept_ctx = _build_concept_context(concept_id, layer)

        if actor_role == "teacher":
            session_mode = (
                "You are Sketch, speaking with an educator using the same drawing-robot classroom app. "
                "Be concise and practical. Still use the --- split."
            )
        else:
            session_mode = (
                "You are Sketch, having a one-on-one tutoring session with a student using a drawing robot. "
                "Always stay in character as Sketch. Never mention Claude, Anthropic, or AI. "
                "Use conversation history to stay coherent — reference what was drawn and build on prior exchanges."
            )

        system_blocks: list[dict] = [
            {"type": "text", "text": persona, "cache_control": {"type": "ephemeral"}},
            {
                "type": "text",
                "text": (
                    f"CONCEPT CONTEXT:\n{concept_ctx}\n\n{session_mode}\n\n"
                    f"The app truncates TTS after roughly {TTS_SPOKEN_CHAR_BUDGET} plain-text characters in the spoken section."
                ),
                "cache_control": {"type": "ephemeral"},
            },
        ]

        # Third block — situational-awareness preamble built from the renderer's
        # SparkContext. UNCACHED (changes every turn). Skipped when no context
        # was supplied so legacy callers behave unchanged.
        if context_text and context_text.strip():
            system_blocks.append({
                "type": "text",
                "text": (
                    "SITUATIONAL AWARENESS — what's happening right now in the app.\n"
                    "Use this to ground your reply in the student's actual work.\n"
                    "Try to infer what they're trying to build from the scene + recent events. "
                    "If you can confidently guess, weave that into your reply ('looks like you're "
                    "building a maze — want me to help test it?'). If you really can't tell, ask "
                    "ONE short clarifying question instead of guessing wrong.\n\n"
                    f"{context_text.strip()}"
                ),
            })

        user_text = _build_user_message(
            student_name=student_name,
            actor_role=actor_role,
            trigger=trigger,
            layer=layer,
            student_message=student_message,
            drawing_prompt=drawing_prompt,
            path_count=path_count,
        )
        messages = _trim_history(list(session.history)) + [{"role": "user", "content": user_text}]

        # In-memory response cache. v3 keys context_text into the hash so a
        # different scene state doesn't reuse a stale cached completion.
        cache_key = _sha256({
            "v": 3, "model": "claude-sonnet-4-6", "actor_role": actor_role,
            "age_group": age_group, "trigger": trigger, "concept_id": concept_id,
            "layer": layer, "user": user_text, "messages": messages,
            "context": context_text or "",
        })
        with _stream_lock:
            cached = _lru_get(_stream_lru, cache_key, _CACHE_TTL)
        if cached:
            for i in range(0, len(cached), 32):
                yield cached[i: i + 32]
            session.history.append({"role": "user", "content": user_text})
            session.history.append({"role": "assistant", "content": cached})
            session.history = _trim_history(session.history)
            return

        accumulated = ""
        async with self._client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=512,
            system=system_blocks,  # type: ignore[arg-type]
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                accumulated += text
                yield text

        with _stream_lock:
            _lru_put(_stream_lru, cache_key, accumulated, _CACHE_MAX)

        session.history.append({"role": "user", "content": user_text})
        session.history.append({"role": "assistant", "content": accumulated})
        session.history = _trim_history(session.history)

    async def evaluate(
        self,
        *,
        student_name: str,
        age_group: str,
        actor_role: str = "student",
        concept_id: str,
        layer: str,
        drawing_prompt: str,
        path_count: int,
    ) -> dict:
        if self._client is None:
            return {"passed": True, "score": 75, "creativity": 70, "concept_alignment": 80,
                    "complexity": 65, "feedback": "Great work! Keep exploring.", "suggest_next_layer": False}

        persona = _PERSONAS.get(age_group, _PERSONA_BUILDER)
        concept_ctx = _build_concept_context(concept_id, layer)
        session = _get_session(student_name, concept_id, actor_role=actor_role)
        recent_history = _trim_history(list(session.history))[-6:]

        eval_prompt = (
            f"A student named {student_name} just submitted a drawing.\n"
            f"Prompt: \"{drawing_prompt}\"\nPath segments: {path_count}.\n\n"
            "Evaluate this drawing. Score each 0–100:\n"
            "- score, creativity, concept_alignment, complexity\n"
            "- passed: true if score >= 50\n"
            "- feedback: 1–2 age-appropriate sentences\n"
            "- suggest_next_layer: true if clearly ready\n\n"
            "Reply with ONLY valid JSON: "
            '{"passed":true,"score":75,"creativity":70,"concept_alignment":80,"complexity":65,"feedback":"Nice work!","suggest_next_layer":false}'
        )

        msg = await self._client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            system=[
                {"type": "text", "text": persona, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": f"CONCEPT CONTEXT:\n{concept_ctx}", "cache_control": {"type": "ephemeral"}},
            ],
            messages=[*recent_history, {"role": "user", "content": eval_prompt}],
        )

        raw = msg.content[0].text.strip() if msg.content else ""
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()
        try:
            result = json.loads(raw)
            for key in ("score", "creativity", "concept_alignment", "complexity"):
                result[key] = max(0, min(100, int(result.get(key, 50))))
            result.setdefault("passed", result.get("score", 50) >= 50)
            result.setdefault("feedback", "Keep exploring!")
            result.setdefault("suggest_next_layer", False)
            return result
        except json.JSONDecodeError:
            return {"passed": True, "score": 50, "creativity": 50, "concept_alignment": 50,
                    "complexity": 50, "feedback": raw or "Keep exploring!", "suggest_next_layer": False}

    async def observe(
        self,
        *,
        student_name: str,
        age_group: str,
        actor_role: str = "student",
        concept_id: str,
        layer: str,
        context_text: str,
    ) -> dict:
        """
        Tick-driven observation. Given a SparkContext preamble (rendered as
        natural-language text by the renderer), the tutor decides whether
        it has anything genuinely useful to say *right now* and/or whether
        to call one of the agent tools.

        Returns ``{speak: bool, message: str, tool_request?: {...}}``.
        Most ticks return ``{speak: False}`` and Spark stays silent. See
        services/local-runtime/app/services/tutor_service.py for the
        canonical reference implementation; this mirror exists so the
        cloud deploy on Render serves the same endpoint.
        """
        type(self)._observe_counters["total"] += 1
        if self._client is None:
            type(self)._observe_counters["silent"] += 1
            return {"speak": False, "message": ""}
        if not context_text or not context_text.strip():
            type(self)._observe_counters["silent"] += 1
            return {"speak": False, "message": ""}

        persona = _PERSONAS.get(age_group, _PERSONA_BUILDER)
        concept_ctx = _build_concept_context(concept_id, layer)

        observation_prompt = (
            "OBSERVATION TICK — you are watching a student work in the app.\n\n"
            "Be a present, attentive tutor. Roughly 1 in 3 ticks should produce "
            "either a short spoken sentence or a tool call — the other 2 in 3 "
            "you stay silent. Don't go silent for many ticks in a row when there's "
            "real activity on the canvas; a kid wants to feel watched. But don't "
            "fill silence for its own sake either — only act when you have "
            "something genuinely useful, kind, or curious to add.\n\n"
            "When you DO act, you have two channels:\n"
            "  1. SPEAK — return a short kind sentence via the JSON below.\n"
            "  2. TOOL — call one of the available tools when an action is "
            "more useful than a sentence.\n\n"
            "Tool guidelines:\n"
            "- highlight_object: annotative, fine to use whenever pointing helps.\n"
            "- award_xp: rare, only for visible effort or genuine creativity.\n"
            "- add_demo_object: rarest of all. The student will be asked Yes/No "
            "before it actually places. Don't request unless words really "
            "aren't enough. Always pair with a short `reason`.\n\n"
            "Speech is independent from tools — you can speak without using a "
            "tool, use a tool without speaking, or do both. If you're not "
            "doing either, just return the silent JSON below.\n\n"
            "Reply with ONLY valid JSON for the speech channel, no extra text:\n"
            '{"speak": false, "message": ""}\n'
            "OR\n"
            '{"speak": true, "message": "<one short sentence, no list, no \\"---\\" block>"}\n\n'
            "Constraints when speak=true:\n"
            "- ONE or TWO short sentences (≤180 characters total)\n"
            "- No bullet lists, no numbered steps, no `---` block\n"
            "- Reference what's actually on the canvas or what they just did\n"
            "- Sound like Sketch — same voice as the rest of the session\n"
            "- If you can confidently infer their goal, name it; if not, ask "
            "one short question\n"
        )

        system_blocks: list[dict] = [
            {"type": "text", "text": persona, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": f"CONCEPT CONTEXT:\n{concept_ctx}", "cache_control": {"type": "ephemeral"}},
            {
                "type": "text",
                "text": (
                    "SITUATIONAL AWARENESS — what's happening right now in the app.\n"
                    f"{context_text.strip()}"
                ),
            },
        ]

        # Cost knob: silent ticks dominate; Sonnet 4.6 is fine for nuance but
        # a Haiku swap here would cut observation costs ~3x with little
        # quality loss for one-sentence kid-tutor banter.
        try:
            msg = await self._client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=400,
                system=system_blocks,  # type: ignore[arg-type]
                messages=[{"role": "user", "content": observation_prompt}],
                tools=type(self)._OBSERVE_TOOLS,  # type: ignore[arg-type]
            )
        except Exception:  # noqa: BLE001
            type(self)._observe_counters["error"] += 1
            return {"speak": False, "message": ""}

        # Parse Claude's response — text JSON for speech + optional tool_use
        # block(s). Take the first tool_use as the tool_request the renderer
        # should dispatch; ignore any others.
        text_chunks: list[str] = []
        tool_request: dict | None = None
        for block in (msg.content or []):
            btype = getattr(block, "type", None)
            if btype == "text":
                text_chunks.append(getattr(block, "text", "") or "")
            elif btype == "tool_use" and tool_request is None:
                tool_name = getattr(block, "name", "") or ""
                tool_input = getattr(block, "input", {}) or {}
                if tool_name:
                    reason_val = ""
                    if isinstance(tool_input, dict):
                        reason_val = str(tool_input.get("reason", "") or "")
                    tool_request = {
                        "id": tool_name,
                        "input": tool_input if isinstance(tool_input, dict) else {},
                        "reason": reason_val,
                    }

        raw = "".join(text_chunks).strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()

        speak = False
        message = ""
        if raw:
            try:
                parsed = json.loads(raw)
                speak = bool(parsed.get("speak", False))
                message = str(parsed.get("message", "")).strip() if speak else ""
                if len(message) > 240:
                    message = message[:237] + "…"
            except json.JSONDecodeError:
                if not tool_request:
                    type(self)._observe_counters["error"] += 1
                    return {"speak": False, "message": ""}

        if tool_request:
            type(self)._observe_counters["tool_used"] += 1
        if speak and message:
            type(self)._observe_counters["spoken"] += 1
        elif not tool_request:
            type(self)._observe_counters["silent"] += 1

        result: dict = {"speak": speak, "message": message}
        if tool_request:
            result["tool_request"] = tool_request
        return result


    async def summarize(
        self,
        *,
        student_name: str,
        age_group: str,
        actor_role: str = "student",
        concept_id: str,
        layer: str,
        context_text: str,
        chat_excerpt: str = "",
        duration_sec: int = 0,
    ) -> dict:
        """End-of-session reflection. See local-runtime/services/tutor_service.py
        for full docs — this is a parity mirror so the cloud deploy serves the
        same endpoint. Returns ``{summary, struggled_with?, excelled_at?, sentiment}``."""
        if self._client is None or not context_text.strip():
            return {"summary": "", "sentiment": "neutral"}

        persona = _PERSONAS.get(age_group, _PERSONA_BUILDER)
        concept_ctx = _build_concept_context(concept_id, layer)

        prompt_parts = [
            "SESSION SUMMARY — the student is wrapping up. Reflect on what just",
            "happened so future sessions can feel remembered. Write 1-2 short",
            "sentences a tutor might jot down — concrete, kind, and specific to",
            "what they actually did. Then identify one thing they struggled",
            "with and one thing they did well, and tag the overall sentiment.",
            "",
            f"Session duration: {duration_sec}s.",
        ]
        if chat_excerpt.strip():
            prompt_parts += ["", "Recent chat (most-recent last):", chat_excerpt.strip()[:1500]]
        prompt_parts += [
            "",
            "Reply with ONLY valid JSON:",
            '{"summary":"<1-2 short sentences>",'
            '"struggled_with":"<short phrase or empty>",'
            '"excelled_at":"<short phrase or empty>",'
            '"sentiment":"positive|neutral|frustrated"}',
        ]
        summary_prompt = "\n".join(prompt_parts)

        system_blocks: list[dict] = [
            {"type": "text", "text": persona, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": f"CONCEPT CONTEXT:\n{concept_ctx}", "cache_control": {"type": "ephemeral"}},
            {
                "type": "text",
                "text": (
                    "SITUATIONAL AWARENESS — the session you are summarizing.\n"
                    f"{context_text.strip()}"
                ),
            },
        ]

        try:
            msg = await self._client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=300,
                system=system_blocks,  # type: ignore[arg-type]
                messages=[{"role": "user", "content": summary_prompt}],
            )
        except Exception:  # noqa: BLE001
            return {"summary": "", "sentiment": "neutral"}

        raw = msg.content[0].text.strip() if msg.content else ""
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()
        try:
            parsed = json.loads(raw)
            summary_text = str(parsed.get("summary", "")).strip()[:280]
            struggled = str(parsed.get("struggled_with", "")).strip()[:120] or None
            excelled = str(parsed.get("excelled_at", "")).strip()[:120] or None
            sentiment = str(parsed.get("sentiment", "neutral")).strip().lower()
            if sentiment not in ("positive", "neutral", "frustrated"):
                sentiment = "neutral"
            result: dict = {"summary": summary_text, "sentiment": sentiment}
            if struggled:
                result["struggled_with"] = struggled
            if excelled:
                result["excelled_at"] = excelled
            return result
        except json.JSONDecodeError:
            return {"summary": "", "sentiment": "neutral"}


tutor_service = TutorService()
