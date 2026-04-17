from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncIterator

try:
    import anthropic
except ModuleNotFoundError:  # pragma: no cover - optional local dependency
    anthropic = None  # type: ignore[assignment]

# ─── Age-adaptive persona system prompts ──────────────────────────────────────

_PERSONA_EXPLORER = """\
You are Sketch, a warm and enthusiastic robot tutor for kids aged 6–10.
Speak simply — short sentences, big ideas, zero jargon.
Use analogies to everyday things (games, animals, toys, cartoons).
Ask ONE question at a time. Celebrate every small discovery.
Use the occasional emoji 🤖✏️🎉 to stay fun (but not every sentence).
Never use words like "algorithm", "parameter", or "matrix" without immediately explaining them with a playful comparison.
Keep replies SHORT — 2–4 sentences max unless walking through something step by step.
You have memory of the full conversation above — refer back to what the student said and what you drew together.\
"""

_PERSONA_BUILDER = """\
You are Sketch, an energetic and knowledgeable robot tutor for students aged 11–14.
Use a slightly technical vocabulary — words like "coordinates", "loop", "variable", "sensor", "feedback", "vector" are fine.
Connect ideas to things students care about: games, sports, music, design.
Be encouraging but honest. Use Socratic questions to guide discovery rather than giving answers directly.
Reference how the physical robot works to ground abstract ideas.
Keep replies conversational — 3–5 sentences for dialogue, longer only when introducing a concept step-by-step.
You have memory of the full conversation above — build on what was said, don't repeat yourself.\
"""

_PERSONA_ENGINEER = """\
You are Sketch, a precise and knowledgeable robotics mentor for students aged 15+.
Speak at near-peer level. Use proper technical vocabulary freely: kinematics, homography, PID, parametric equations, control theory, linear algebra, Jacobian.
Express math in plain text or Unicode — for example: x(t) = cx + r·cos(t), not LaTeX dollar-sign notation. The interface does not render LaTeX.
Reference real engineering systems (CNC machines, autonomous vehicles, satellite attitude control).
Be concise and rigorous. Don't over-explain what a technically literate student already knows.
When a student asks "why", give the real mathematical or physical reason.
You have memory of the full conversation above — be consistent, build depth across turns, avoid repeating prior explanations.\
"""

_PERSONAS = {
    "explorer": _PERSONA_EXPLORER,
    "builder": _PERSONA_BUILDER,
    "engineer": _PERSONA_ENGINEER,
}

# ─── In-memory session store ───────────────────────────────────────────────────
# Keyed by (student_name, concept_id) — retains multi-turn conversation history.
# Each entry is a list of {"role": "user"|"assistant", "content": str} dicts.
# History is capped at MAX_HISTORY_TURNS to control token cost.

MAX_HISTORY_TURNS = 10   # 10 user+assistant pairs = 20 messages max

@dataclass
class _TutorSession:
    history: list[dict] = field(default_factory=list)
    last_layer: str = "intuitive"

_sessions: dict[str, _TutorSession] = {}
_sessions_lock = threading.Lock()


def _session_key(student_name: str, concept_id: str) -> str:
    return f"{student_name}::{concept_id}"


def _get_session(student_name: str, concept_id: str) -> _TutorSession:
    key = _session_key(student_name, concept_id)
    with _sessions_lock:
        if key not in _sessions:
            _sessions[key] = _TutorSession()
        return _sessions[key]


def _clear_session(student_name: str, concept_id: str) -> None:
    key = _session_key(student_name, concept_id)
    with _sessions_lock:
        _sessions.pop(key, None)


def _trim_history(history: list[dict]) -> list[dict]:
    """Keep the most recent MAX_HISTORY_TURNS pairs."""
    max_msgs = MAX_HISTORY_TURNS * 2
    if len(history) > max_msgs:
        return history[-max_msgs:]
    return history


# ─── Concepts loader ──────────────────────────────────────────────────────────

_CONCEPTS_PATH = Path(__file__).parents[3] / "cloud-backend" / "data" / "concepts.json"
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
    if layer_data.get("challenge_id"):
        lines.append(f"Challenge ID: {layer_data['challenge_id']}")

    # Provide all layer descriptions so tutor can refer to depth progression
    all_layers = concept.get("layers", {})
    for lname, ldata in all_layers.items():
        if lname != layer and ldata.get("hook"):
            lines.append(f"[{lname} layer hook — for reference]: {ldata['hook']}")

    return "\n".join(lines)


# ─── TutorService ─────────────────────────────────────────────────────────────

class TutorService:
    """
    Claude-powered tutoring agent with:
    - Per-student per-concept conversation history (multi-turn memory)
    - Age-adaptive persona (Explorer / Builder / Engineer)
    - Prompt caching on system blocks for cost efficiency
    - SSE streaming via async generator
    - Non-streaming evaluation endpoint
    - Session reset on concept change
    """

    def __init__(self) -> None:
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        self._client = (
            anthropic.AsyncAnthropic(api_key=api_key)
            if anthropic is not None and api_key
            else None
        )

    def is_available(self) -> bool:
        return self._client is not None

    async def stream_message(
        self,
        *,
        student_name: str,
        age_group: str,
        trigger: str,
        concept_id: str,
        layer: str,
        student_message: str = "",
        drawing_prompt: str = "",
        path_count: int = 0,
    ) -> AsyncIterator[str]:
        """
        Yields text tokens for SSE streaming.
        Maintains per-student per-concept conversation history across calls.
        On concept_change trigger, clears history so each concept starts fresh.
        """
        if self._client is None:
            yield _offline_message(student_name, age_group, concept_id, trigger)
            return

        session = _get_session(student_name, concept_id)

        # Concept change → fresh session
        if trigger == "concept_change":
            session.history.clear()
            session.last_layer = layer

        # Layer change mid-session → add a lightweight context update, keep history
        elif layer != session.last_layer:
            session.last_layer = layer

        persona = _PERSONAS.get(age_group, _PERSONA_BUILDER)
        concept_ctx = _build_concept_context(concept_id, layer)

        system_blocks = [
            {
                "type": "text",
                "text": persona,
                "cache_control": {"type": "ephemeral"},
            },
            {
                "type": "text",
                "text": (
                    "CONCEPT CONTEXT (current tutoring session):\n"
                    f"{concept_ctx}\n\n"
                    "You are Sketch, having a one-on-one tutoring session with a student using a drawing robot. "
                    "The robot physically draws SVG paths on paper — when a student submits a prompt, the robot draws it. "
                    "You watch what the robot drew and guide the student's understanding. "
                    "Always stay in character as Sketch. Never mention Claude, Anthropic, or AI. "
                    "Use the conversation history above to stay coherent across turns — "
                    "reference what was drawn, what the student said, and build on prior exchanges."
                ),
                "cache_control": {"type": "ephemeral"},
            },
        ]

        user_text = _build_user_message(
            student_name=student_name,
            trigger=trigger,
            layer=layer,
            student_message=student_message,
            drawing_prompt=drawing_prompt,
            path_count=path_count,
        )

        # Build full messages list: trimmed history + new user turn
        messages = _trim_history(list(session.history)) + [
            {"role": "user", "content": user_text}
        ]

        accumulated = ""
        async with self._client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=600,
            system=system_blocks,  # type: ignore[arg-type]
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                accumulated += text
                yield text

        # Persist this turn into session history
        session.history.append({"role": "user", "content": user_text})
        session.history.append({"role": "assistant", "content": accumulated})
        session.history = _trim_history(session.history)

    async def evaluate(
        self,
        *,
        student_name: str,
        age_group: str,
        concept_id: str,
        layer: str,
        drawing_prompt: str,
        path_count: int,
    ) -> dict:
        """
        Non-streaming: evaluate whether a student's drawing demonstrates
        understanding of the concept at the current layer.
        Returns: { passed, score, creativity, concept_alignment, complexity,
                   feedback, suggest_next_layer }
        """
        if self._client is None:
            return {
                "passed": True,
                "score": 75,
                "creativity": 70,
                "concept_alignment": 80,
                "complexity": 65,
                "feedback": "Great work! Keep exploring.",
                "suggest_next_layer": False,
            }

        persona = _PERSONAS.get(age_group, _PERSONA_BUILDER)
        concept_ctx = _build_concept_context(concept_id, layer)

        session = _get_session(student_name, concept_id)
        recent_history = _trim_history(list(session.history))[-6:]

        eval_prompt = (
            f"A student named {student_name} just submitted a drawing.\n"
            f"Their prompt was: \"{drawing_prompt}\"\n"
            f"The drawing produced {path_count} distinct path segment(s).\n\n"
            "Based on the concept, the active layer, and the conversation history, "
            "evaluate this drawing across multiple dimensions.\n\n"
            "Score each dimension from 0 to 100:\n"
            "- **score**: Overall quality (0-100)\n"
            "- **creativity**: Originality and inventiveness of the prompt and approach (0-100)\n"
            "- **concept_alignment**: How well the drawing demonstrates understanding of the concept (0-100)\n"
            "- **complexity**: Sophistication of the drawing — path count, structure, detail (0-100)\n\n"
            "Also determine:\n"
            "- **passed**: true if score >= 50 and the student shows meaningful engagement\n"
            "- **feedback**: 1-2 sentences of age-appropriate encouragement\n"
            "- **suggest_next_layer**: true if the student is clearly ready for a deeper challenge\n\n"
            "Reply with ONLY valid JSON, no extra text:\n"
            "{"
            '"passed": true, '
            '"score": 75, '
            '"creativity": 70, '
            '"concept_alignment": 80, '
            '"complexity": 65, '
            '"feedback": "Nice work!", '
            '"suggest_next_layer": false'
            "}"
        )

        msg = await self._client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            system=[
                {
                    "type": "text",
                    "text": persona,
                    "cache_control": {"type": "ephemeral"},
                },
                {
                    "type": "text",
                    "text": f"CONCEPT CONTEXT:\n{concept_ctx}",
                    "cache_control": {"type": "ephemeral"},
                },
            ],
            messages=[
                *recent_history,
                {"role": "user", "content": eval_prompt},
            ],
        )

        raw = msg.content[0].text.strip() if msg.content else ""
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()

        try:
            result = json.loads(raw)
            for key in ("score", "creativity", "concept_alignment", "complexity"):
                if key not in result or not isinstance(result[key], (int, float)):
                    result[key] = 50
                result[key] = max(0, min(100, int(result[key])))
            if "passed" not in result:
                result["passed"] = result.get("score", 50) >= 50
            if "feedback" not in result:
                result["feedback"] = "Keep exploring!"
            if "suggest_next_layer" not in result:
                result["suggest_next_layer"] = False
            return result
        except json.JSONDecodeError:
            return {
                "passed": True,
                "score": 50,
                "creativity": 50,
                "concept_alignment": 50,
                "complexity": 50,
                "feedback": raw or "Keep exploring — you're making progress!",
                "suggest_next_layer": False,
            }

    def clear_student_sessions(self, student_name: str) -> None:
        """Clear all concept sessions for a student (e.g., on logout)."""
        with _sessions_lock:
            keys = [k for k in _sessions if k.startswith(f"{student_name}::")]
            for key in keys:
                _sessions.pop(key, None)


# ─── User message builder ─────────────────────────────────────────────────────

def _build_user_message(
    *,
    student_name: str,
    trigger: str,
    layer: str,
    student_message: str,
    drawing_prompt: str,
    path_count: int,
) -> str:
    name = student_name or "the student"

    if trigger == "concept_change":
        return (
            f"{name} just opened this concept at the **{layer}** layer. "
            "Give a warm, engaging introduction in your age-appropriate style. "
            "Explain the core idea, pose the hook question, and suggest the starter activity. "
            "Be inviting and direct — don't wait for them to ask first."
        )

    if trigger == "drawing_submitted":
        segments_desc = (
            f"{path_count} path segment(s)" if path_count > 0 else "no paths yet"
        )
        return (
            f"{name} submitted a drawing. "
            f"Prompt: \"{drawing_prompt}\". Result: {segments_desc}.\n\n"
            "React as their tutor: celebrate what's interesting about this, "
            "connect the drawing explicitly to the concept we're studying, "
            "and gently nudge them toward a deeper observation or next variation. "
            "If the path count is very low (0–1), ask what happened — maybe the robot didn't move yet. "
            "If path count is high (10+), note the complexity positively."
        )

    if trigger == "hint_request":
        parts = [f"{name} asked for a hint at the **{layer}** layer."]
        if drawing_prompt:
            parts.append(f"Their most recent drawing was: \"{drawing_prompt}\" ({path_count} path segment(s)).")
        else:
            parts.append("They haven't submitted a drawing yet.")
        parts.append(
            "Give a concrete, specific nudge tied directly to what they just drew and the active concept. "
            "If no drawing exists yet, suggest a first simple experiment to try. "
            "Ask a question or give an analogy — don't give the full answer away."
        )
        return " ".join(parts)

    if trigger == "layer_change":
        return (
            f"{name} just moved to the **{layer}** layer. "
            "Acknowledge the progression — briefly connect where they were to where they are now. "
            "Introduce what's different about this layer and set up the first challenge."
        )

    if trigger == "student_reply" and student_message:
        return (
            f"{name}: \"{student_message}\"\n\n"
            "Respond naturally as their robot tutor — this is a conversation, not a lecture. "
            "If they're showing understanding, go deeper. "
            "If confused, find a simpler angle. "
            "If asking a factual question, answer it precisely then connect it back to the robot."
        )

    return (
        f"{name} is interacting with you. Continue the tutoring session naturally, "
        "building on the conversation history above."
    )


# ─── Offline fallback ─────────────────────────────────────────────────────────

def _offline_message(
    student_name: str, age_group: str, concept_id: str, trigger: str
) -> str:
    name = student_name or "there"
    concept = _get_concept(concept_id)
    title = concept.get("title", "this concept") if concept else "this concept"

    if trigger == "hint_request":
        return "Here's a hint: try thinking about what shape the robot would need to trace to show this concept. Start simple — one line, one curve."

    if age_group == "explorer":
        return (
            f"Hi {name}! I'm Sketch, your robot tutor! 🤖 "
            f"Today we're exploring **{title}** together. Ready to make something awesome?"
        )
    if age_group == "engineer":
        return (
            f"Welcome, {name}. Let's dig into **{title}**. "
            "We'll start with the core abstraction and build toward the full mathematical model."
        )
    return (
        f"Hey {name}! Ready to level up? We're diving into **{title}** — "
        "this is where robotics gets really interesting. Let's start drawing."
    )


tutor_service = TutorService()
