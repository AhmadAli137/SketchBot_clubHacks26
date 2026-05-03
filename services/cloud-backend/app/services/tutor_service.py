from __future__ import annotations

import json
import random
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
OUTPUT FORMAT (critical — follow every time):
- One short response. 1–3 short sentences. Plain prose. That's it.
- HARD LIMIT: stay at or under **{TTS_SPOKEN_CHAR_BUDGET} characters** of plain text. The whole reply must fit in that budget.
- DO NOT use a "---" divider line. There is no separate "written-only" section. The whole response is spoken aloud.
- DO NOT use markdown headings (### or **Bold:**) or bullet lists or numbered lists by default. Speak in flowing sentences.
- Only use a brief inline list (e.g., "1, 2, 3") if the student EXPLICITLY asks for steps, code, or an enumeration.
- Never write "Here's what's on your canvas:" / "A few starter sparks:" / "Here are some ideas:" headers. Just say the thing.
- Do not mention "TTS", "spoken layer", "character limit", or "voice API" to the student.\
"""

_PERSONA_EXPLORER = """\
You are Sketch, a warm and enthusiastic robot tutor for kids aged 6–10.
Speak simply — short sentences, big ideas, zero jargon.
Use analogies to everyday things (games, animals, toys, cartoons).
Ask at most ONE question per reply. Celebrate small discoveries with a phrase, not a paragraph.
Occasional emoji is fine (🤖✏️🎉) — not every sentence.
Never use words like "algorithm", "parameter", or "matrix" without an immediate playful comparison.
You have memory of the full conversation above — refer back briefly when relevant; never repeat yourself.

""" + _OUTPUT_CHANNELS

_PERSONA_BUILDER = """\
You are Sketch, an energetic and knowledgeable robot tutor for students aged 11–14.
Slightly technical vocabulary is fine — "coordinates", "loop", "variable", "sensor", "feedback", "vector".
Connect ideas to things students care about: games, sports, music, design.
Encouraging but honest. Use Socratic questions to guide rather than answer directly — sparingly.
Reference how the physical robot works to ground abstract ideas, in passing.
You have memory of the full conversation above — build on it, never repeat yourself.

""" + _OUTPUT_CHANNELS

_PERSONA_ENGINEER = """\
You are Sketch, a precise and knowledgeable robotics mentor for students aged 15+.
Near-peer level. Proper technical vocabulary is fine: kinematics, homography, PID, parametric equations, control theory, linear algebra, Jacobian.
Express math inline in plain text or Unicode — x(t) = cx + r·cos(t), never LaTeX dollar-sign notation.
Reference real engineering systems (CNC machines, autonomous vehicles, satellite attitude control) in passing.
You have memory of the full conversation above — consistent, additive, never repetitive.

""" + _OUTPUT_CHANNELS

_PERSONAS = {
    "explorer": _PERSONA_EXPLORER,
    "builder": _PERSONA_BUILDER,
    "engineer": _PERSONA_ENGINEER,
}

# ─── Programming-tab capability ──────────────────────────────────────────────
# Cached system block describing the voice-to-program flow. Appended to
# every chat + observe system stack so the tutor knows it can interpret
# kid-spoken rules into structured ProgramBlocks via the program_append_block
# tool. Kept generic across age groups — the persona above already adjusts
# vocabulary; the capability description is the same for everyone.
_PROGRAMMING_CAPABILITY = """\
PROGRAMMING TAB — voice-built robot programs.

When the kid talks about what they want the robot to do, you can BUILD a program for them, one block at a time, by calling the program_append_block tool. Each block becomes a visible step in the Programming tab on the right. Then they tap Run (or say "run it") and the robot executes the program in the simulator.

When to use this:
- The kid describes an action ("drive forward 12 inches", "turn right 90 degrees", "stop when it sees something close").
- The kid sketches a routine ("first go forward, then turn, then go forward again").
- They ask "can you make the robot ___?".

WHAT YOU CAN BUILD (every block has a fresh unique id you generate):
- drive { distance: { value, unit: cm|in|m }, speed }      — go forward (negative distance = backward)
- turn  { degrees, speed }                                  — pivot in place; +deg = left, -deg = right
- motor.set { side: left|right|both, speed, seconds }       — raw motor control for one or both sides; speed is -100..100, negative reverses
- motor.until { side, speed, condition }                    — run motors until a condition fires
- wait { seconds }
- if    { condition, then: [...], else?: [...] }
- loop  { body: [...], times? OR until? }                   — exactly one of times|until
- stop                                                       — halt the program

Conditions:
- distance.lt / distance.gt with sensor=ultrasonic and threshold={value, unit} — front-facing range sensor on the bot
- travelled with distance — how far the bot has moved since the block started
- elapsed with seconds — wall-clock time since the block started

Speed is normalised 0..100 (kid-friendly, never m/s). 100 is full speed, 50 is half. Negative reverses. Distances ALWAYS carry their unit — keep the kid's words ("12 inches" stays inches, don't silently convert to cm).

Behavior rules:
1. **MULTI-RULE MESSAGES** — when the kid lists more than one rule in a single message ("drive forward 12 inches, then turn right 90 degrees, then forward another foot"), emit ONE program_append_block tool call PER rule — multiple tool calls in your single response. Do NOT emit just the first and stop. Do NOT wait for a tool_result between calls — emit them all at once, then write your spoken text reply afterwards. The kid expects every rule they spoke to land as a step, not just the first.
2. Append blocks AS the kid describes them — don't wait for a perfect spec. They'll iterate.
3. If they're vague ("kinda fast"), pick a reasonable number (60) and tell them what you picked: "I'll try 60 — too fast?". Never refuse to act because of imprecision.
4. If they say something the schema can't represent (e.g., "drive in a figure 8"), either decompose it ("a figure 8 is two circles — let me start with the first loop") or ask one clarifying question.
5. Do NOT call program_run yourself unless the kid clearly says "run it"/"try it"/"go". Build silently, run on their command.
6. When you append a block (or several), briefly summarise what you added in plain language ("Added three steps — forward 12 in, turn right 90°, forward another foot") so they know what landed.
7. To clear and start over, call program_clear (mutative — confirms with the kid).

Tell the kid up front (when they're new to the tab) that they can SAY rules and you'll turn them into steps. A starter line like "Try saying 'drive forward 12 inches' or 'turn right 90'." helps them know the shape.\
"""

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

def _lift_tool_reason_as_speech(reason: str) -> str:
    """Convert a tool's `reason` field into a sentence suitable for speech.

    When Claude returns a tool_use block without an accompanying speak
    block, the perceptive observation we'd want to *say* is usually
    already inside the tool's reason. Lift it. Light pronoun fixup so
    third-person ("They placed cones") becomes second-person ("You
    placed cones") — which is how Sketch should address the student.
    """
    if not reason or not isinstance(reason, str):
        return ""
    text = reason.strip()
    if not text:
        return ""
    # Third → second person fixup. Word-boundary regex so we don't
    # mangle "they" inside other words. Order matters: do "Their" before
    # "They" so capitalisation falls through cleanly.
    import re
    substitutions = [
        (r"\bThey've\b", "You've"), (r"\bthey've\b", "you've"),
        (r"\bThey're\b", "You're"), (r"\bthey're\b", "you're"),
        (r"\bThey'd\b", "You'd"),   (r"\bthey'd\b", "you'd"),
        (r"\bThey'll\b", "You'll"), (r"\bthey'll\b", "you'll"),
        (r"\bTheir\b", "Your"),     (r"\btheir\b", "your"),
        (r"\bThem\b", "You"),       (r"\bthem\b", "you"),
        (r"\bThey\b", "You"),       (r"\bthey\b", "you"),
    ]
    for pat, repl in substitutions:
        text = re.sub(pat, repl, text)
    # Trim to TTS budget (380 chars), conservative.
    if len(text) > 240:
        text = text[:237] + "…"
    return text


async def _anthropic_with_retry(
    call,
    *,
    label: str,
    max_attempts: int = 3,
    base_delay: float = 1.0,
):
    """Run an async Anthropic call with exponential backoff on transient
    errors (429, 5xx, connection drops). Honours the Retry-After header
    when present so we don't hammer the API mid-rate-limit.

    Other (non-transient) errors propagate immediately. Final attempt
    re-raises so the caller can decide how to surface failure.
    """
    import asyncio
    import logging
    import random

    log = logging.getLogger("sketchbot.tutor")

    # Import lazily so the module still imports if the anthropic package
    # isn't installed — matches the existing pattern at module top.
    try:
        from anthropic import (
            APIConnectionError,
            APITimeoutError,
            InternalServerError,
            RateLimitError,
        )
    except ImportError:
        # No anthropic SDK; nothing to retry against — just call.
        return await call()

    transient = (RateLimitError, APIConnectionError, APITimeoutError, InternalServerError)

    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await call()
        except transient as exc:
            last_exc = exc
            if attempt >= max_attempts:
                log.warning(
                    "anthropic.retry_exhausted label=%s attempt=%d err=%s",
                    label, attempt, type(exc).__name__,
                )
                raise

            # Honour Retry-After if the SDK surfaced a response with one.
            wait: float | None = None
            response = getattr(exc, "response", None)
            if response is not None:
                ra = getattr(response, "headers", {}).get("retry-after")
                if ra:
                    try:
                        wait = float(ra)
                    except (TypeError, ValueError):
                        wait = None

            if wait is None:
                # Exponential backoff with ±20% jitter so concurrent
                # sessions don't pile back onto the API in lockstep.
                wait = base_delay * (2 ** (attempt - 1))
                wait *= 1 + (random.random() - 0.5) * 0.4

            wait = max(0.1, min(wait, 30.0))
            log.info(
                "anthropic.retry label=%s attempt=%d/%d err=%s wait_s=%.2f",
                label, attempt, max_attempts, type(exc).__name__, wait,
            )
            await asyncio.sleep(wait)

    # Defensive — loop should have either returned or raised by now.
    if last_exc is not None:
        raise last_exc
    raise RuntimeError(f"anthropic.retry: unreachable label={label}")


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
            "name": "program_append_block",
            "description": (
                "Append one block to the kid's current program in the "
                "Programming tab. Use whenever the kid says a rule like "
                "'move forward 12 inches', 'turn left 90 degrees', or "
                "'if ultrasonic reads less than 20 cm, stop'. Block kind is "
                "one of: motor.set, motor.until, turn, drive, wait, if, "
                "loop, stop. Speed is normalised 0–100. Distances carry "
                "their unit. Always provide a fresh unique block id."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "block": {
                        "type": "object",
                        "description": "The ProgramBlock to append.",
                        "properties": {
                            "id":      {"type": "string"},
                            "kind":    {"type": "string", "enum": ["motor.set","motor.until","turn","drive","wait","if","loop","stop"]},
                            "side":    {"type": "string", "enum": ["left","right","both"]},
                            "speed":   {"type": "number"},
                            "seconds": {"type": "number"},
                            "degrees": {"type": "number"},
                            "distance": {
                                "type": "object",
                                "properties": {
                                    "value": {"type": "number"},
                                    "unit":  {"type": "string", "enum": ["cm","in","m"]},
                                },
                                "required": ["value","unit"],
                            },
                            "condition": {
                                "type": "object",
                                "properties": {
                                    "kind":      {"type": "string", "enum": ["distance.lt","distance.gt","travelled","elapsed"]},
                                    "sensor":    {"type": "string", "enum": ["ultrasonic"]},
                                    "threshold": {
                                        "type": "object",
                                        "properties": {
                                            "value": {"type": "number"},
                                            "unit":  {"type": "string", "enum": ["cm","in","m"]},
                                        },
                                        "required": ["value","unit"],
                                    },
                                    "seconds": {"type": "number"},
                                },
                                "required": ["kind"],
                            },
                        },
                        "required": ["id","kind"],
                    },
                },
                "required": ["block"],
            },
        },
        {
            "name": "program_run",
            "description": (
                "Execute the current program against the active bot in the "
                "simulator. Mutative — the renderer surfaces a Yes/No "
                "confirmation. Use after the kid says 'run it' or 'try it', "
                "not on every block append."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string"},
                },
            },
        },
        {
            "name": "program_clear",
            "description": (
                "Remove every block from the program — start over. Use when "
                "the kid says 'reset' or 'start fresh'. Mutative."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string"},
                },
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
    ) -> AsyncIterator[Any]:
        # Yields text deltas (str) plus optional structured events (dict)
        # like {"type": "tool_request", "tool": {...}} after the text
        # stream completes. Router downcasts based on isinstance.
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
            {"type": "text", "text": _PROGRAMMING_CAPABILITY, "cache_control": {"type": "ephemeral"}},
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
            "v": 4, "model": "claude-sonnet-4-6", "actor_role": actor_role,
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
        # Pass the tool registry so chat turns can build programs from
        # voice rules. Without this, "drive forward 12 inches" becomes a
        # text-only response with no program_append_block call. The
        # renderer's SSE handler dispatches tool_request events (yielded
        # below as dicts after the text stream completes) into the same
        # SparkToolDispatcher that the observation path uses.
        async with self._client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system_blocks,  # type: ignore[arg-type]
            messages=messages,
            tools=type(self)._OBSERVE_TOOLS,  # type: ignore[arg-type]
        ) as stream:
            async for text in stream.text_stream:
                accumulated += text
                yield text
            # After text streaming completes, harvest any tool_use blocks
            # the model emitted alongside the reply. Each one becomes a
            # tool_request event the renderer dispatches via
            # SparkToolDispatcher (annotative tools run immediately;
            # mutative ones surface a confirmation).
            try:
                final = await stream.get_final_message()
                for block in (final.content or []):
                    btype = getattr(block, "type", None)
                    if btype != "tool_use":
                        continue
                    yield {
                        "type": "tool_request",
                        "tool": {
                            "id": getattr(block, "name", ""),
                            "input": getattr(block, "input", {}) or {},
                        },
                    }
            except Exception:
                # Tool harvest is best-effort — text reply already streamed
                # so any failure here shouldn't surface to the kid.
                pass

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

        msg = await _anthropic_with_retry(
            lambda: self._client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=300,
                system=[
                    {"type": "text", "text": persona, "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": f"CONCEPT CONTEXT:\n{concept_ctx}", "cache_control": {"type": "ephemeral"}},
                ],
                messages=[*recent_history, {"role": "user", "content": eval_prompt}],
            ),
            label="evaluate",
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
        prior_hypothesis: str | None = None,
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

        # Session salt — a tiny random integer prepended to the prompt.
        # Without it the model produces almost identical phrasings across
        # ticks; with it Claude breaks out of phrasing ruts.
        salt = random.randint(1000, 999999)

        observation_prompt = (
            f"[session pulse: {salt}]\n\n"
            "MISSION-DRIVEN TICK — you're a tutor with an agenda, not a "
            "narrator. Every session has a mission: a concrete thing the "
            "kid is building toward. Your job is to figure out what that "
            "mission is (or propose one), then drive toward it.\n\n"
            "Mission detection (do this every tick before deciding what to say):\n"
            "1. Is there an explicit mission already in the chat? (E.g., "
            "you proposed \"let's build a racetrack\" and the kid said yes.) "
            "If so, drive toward it — call out progress, suggest the next "
            "concrete step, point out detours.\n"
            "2. Is the mission *implied* by what's on the canvas? Cones in "
            "a curve = racetrack. Walls in a maze = path-finding course. "
            "Sumo bots + boundaries = arena. Apriltags scattered = "
            "navigation challenge. If you can read it from the build, name "
            "it (\"looks like you're building an X — want to make it a real "
            "Y?\") and drive from there.\n"
            "3. No mission yet, no implied direction? **Propose one.** "
            "Offer 2-3 concrete options framed as missions, not questions: "
            "\"Want to build a racetrack with the cones, a sumo arena with "
            "walls, or a maze for the bot to navigate?\" Then commit to "
            "whichever they pick (or the first one if they don't reply).\n\n"
            "Driving the mission means:\n"
            "- Naming the next concrete step (\"add 2 more cones to close the "
            "loop\", \"drop a sumo bot in the middle to test the arena\").\n"
            "- Calling out progress in mission terms (\"that's the curve "
            "done — now we need a finish line\").\n"
            "- Connecting moves to robotics concepts when natural (\"those "
            "cones become a path the bot has to follow — that's how real "
            "self-driving cars handle obstacles\").\n"
            "- NOT just describing what they did. Description without "
            "direction is bystander-tutoring. Always end on a forward step.\n\n"
            "Style:\n"
            "- Sound like yourself — vary your energy, sentence shapes, "
            "and openers across ticks. Drop any formula.\n"
            "- React to specifics. Reference actual objects, actual moves, "
            "actual moments. Generic remarks land flat.\n"
            "- One question MAX per reply, and only when it actually "
            "advances the mission (e.g., \"racetrack or arena?\"). Don't "
            "ask questions that don't change what happens next.\n"
            "- Don't repeat anything you've already said in the chat "
            "excerpt above.\n\n"
            "Channels:\n"
            "  1. SPEAK — REQUIRED whenever you react. Every reaction must "
            "include a short spoken sentence via the JSON below. One or two "
            "sentences max, ≤180 characters total. No bullet lists, no "
            "numbered steps, no `---` block.\n"
            "  2. TOOL — OPTIONAL accompaniment to your speech. Call a tool "
            "only when an action genuinely adds something words can't (e.g., "
            "highlight a specific cone you're pointing at, award XP for a "
            "real moment of creativity). NEVER call a tool instead of "
            "speaking — that leaves the kid with silence.\n\n"
            "Hard rule: tool-only responses are forbidden. If you'd call a "
            "tool, also speak. If you have nothing meaningful to say, don't "
            "call a tool either — return {speak: false, message: \"\"}.\n\n"
            "If you do call a tool, write the tool's `reason` field as if "
            "speaking directly to the student — second person (\"you placed "
            "the cones in a curve\"), warm and present-tense — because the "
            "system reads tool reasons aloud when a speak block is missing. "
            "Don't write internal third-person justifications like \"the "
            "student placed cones\".\n\n"
            "Tool reminders: highlight_object is fine whenever pointing helps; "
            "award_xp is rare and tied to a real reason; add_demo_object is "
            "rarest — the student is asked Yes/No before it places, so only "
            "request when words alone really won't carry the idea.\n\n"
            "Reply with ONLY valid JSON for the speech channel, no extra text. "
            "Include a `next_check` field (integer seconds, 5-180) telling "
            "the renderer when you'd like to be invoked again — short when "
            "something interesting is unfolding, long when the kid is in flow "
            "and shouldn't be interrupted, very long when nothing's happening. "
            "Also include a `hypothesis` field (≤200 chars): your one-sentence "
            "read of what the kid is doing AND what the active mission is, "
            "phrased to your future self. This carries forward to the next "
            "tick so you maintain continuity across thinks. Refine it each "
            "time as you learn more.\n"
            '{"speak": false, "message": "", "next_check": 30, '
            '"hypothesis": "Building a racetrack with cones; mission is to close the loop and add a finish line."}\n'
            "OR\n"
            '{"speak": true, "message": "<your sentence>", "next_check": 45, '
            '"hypothesis": "<your read>"}\n'
        )

        system_blocks: list[dict] = [
            {"type": "text", "text": persona, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": _PROGRAMMING_CAPABILITY, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": f"CONCEPT CONTEXT:\n{concept_ctx}", "cache_control": {"type": "ephemeral"}},
            {
                "type": "text",
                "text": (
                    "SITUATIONAL AWARENESS — what's happening right now in the app.\n"
                    f"{context_text.strip()}"
                ),
            },
        ]
        if prior_hypothesis and prior_hypothesis.strip():
            system_blocks.append({
                "type": "text",
                "text": (
                    "YOUR LAST READ OF THE SESSION (carries forward across "
                    "ticks for continuity — refine it in this tick's "
                    "hypothesis field):\n"
                    f"{prior_hypothesis.strip()[:300]}"
                ),
            })

        # Cost knob: silent ticks dominate; Sonnet 4.6 is fine for nuance but
        # a Haiku swap here would cut observation costs ~3x with little
        # quality loss for one-sentence kid-tutor banter.
        try:
            # Extended thinking — Claude runs a hidden reasoning pass before
            # producing the visible output. Effect on observation ticks:
            # responses gain depth and break out of formulaic phrasing
            # because the *reasoning path* genuinely differs each tick. The
            # thinking blocks aren't shown to the user; we filter them out
            # of msg.content below. Budget is intentionally small (~half of
            # max_tokens) so cost only goes up modestly.
            msg = await _anthropic_with_retry(
                lambda: self._client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=2400,
                    temperature=1.0,  # required to be 1.0 when thinking enabled
                    thinking={"type": "enabled", "budget_tokens": 1024},
                    system=system_blocks,  # type: ignore[arg-type]
                    messages=[{"role": "user", "content": observation_prompt}],
                    tools=type(self)._OBSERVE_TOOLS,  # type: ignore[arg-type]
                ),
                label="observe",
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

        # With extended thinking + the looser observation prompt, Claude
        # occasionally wraps the JSON in a leading prose sentence. Carve out
        # the JSON object specifically so a "I'll observe quietly. {...}"
        # response still parses cleanly.
        if raw and not raw.startswith("{"):
            first = raw.find("{")
            last = raw.rfind("}")
            if first != -1 and last > first:
                raw = raw[first : last + 1]

        speak = False
        message = ""
        next_check: int | None = None
        hypothesis: str | None = None
        if raw:
            try:
                parsed = json.loads(raw)
                speak = bool(parsed.get("speak", False))
                message = str(parsed.get("message", "")).strip() if speak else ""
                if len(message) > 240:
                    message = message[:237] + "…"
                # Self-paced cadence — agent decides when it wants to be
                # invoked next. Clamp to a sane range so a runaway value
                # can't break the loop.
                nc_raw = parsed.get("next_check")
                if isinstance(nc_raw, (int, float)):
                    next_check = max(5, min(180, int(nc_raw)))
                # Working-memory hypothesis — agent's read of the session
                # that the caller carries forward to the next tick.
                hyp_raw = parsed.get("hypothesis")
                if isinstance(hyp_raw, str) and hyp_raw.strip():
                    hypothesis = hyp_raw.strip()[:240]
            except json.JSONDecodeError:
                if not tool_request:
                    type(self)._observe_counters["error"] += 1
                    return {"speak": False, "message": ""}

        # Tool-only responses (tool_use without a speak block) are the common
        # failure mode: with extended thinking + tool_choice=auto, Claude
        # frequently emits a tool_use and stops, never producing the JSON
        # text block we expect for speech. The prompt forbids this, but
        # Anthropic's tool-use stop-reason path produces it anyway.
        #
        # The good news: the tool's `reason` field is almost always a
        # perfect spoken sentence — the model put its observation there
        # instead of in a speak channel. So instead of dropping the tool
        # (which would leave the kid in silence and waste the XP / hint
        # the model was producing), lift the reason as the spoken message
        # and keep the tool firing.
        if tool_request and not (speak and message):
            lifted = _lift_tool_reason_as_speech(tool_request.get("reason", ""))
            if lifted:
                speak = True
                message = lifted
                import logging
                logging.getLogger("sketchbot.tutor").info(
                    "tutor.tool_reason_lifted tool=%s message=%r",
                    tool_request.get("id"), message[:120],
                )
            else:
                # No usable reason — drop the tool so we don't run a silent
                # side-effect. Better to skip and let the next think speak.
                import logging
                logging.getLogger("sketchbot.tutor").warning(
                    "tutor.tool_only_dropped tool=%s — no usable reason to lift",
                    tool_request.get("id"),
                )
                tool_request = None

        if tool_request:
            type(self)._observe_counters["tool_used"] += 1
        if speak and message:
            type(self)._observe_counters["spoken"] += 1
        elif not tool_request:
            type(self)._observe_counters["silent"] += 1

        result: dict = {"speak": speak, "message": message}
        if tool_request:
            result["tool_request"] = tool_request
        if next_check is not None:
            result["next_check"] = next_check
        if hypothesis is not None:
            result["hypothesis"] = hypothesis
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
            msg = await _anthropic_with_retry(
                lambda: self._client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=300,
                    system=system_blocks,  # type: ignore[arg-type]
                    messages=[{"role": "user", "content": summary_prompt}],
                ),
                label="summarize",
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
