from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator

try:
    import anthropic
except ModuleNotFoundError:  # pragma: no cover - optional local dependency
    anthropic = None  # type: ignore[assignment]

from app.services.tutor_audit_log import (
    log_chat_turn,
    log_evaluation,
    log_session_event,
)

# ─── Age-adaptive persona system prompts ──────────────────────────────────────
#
# OUTPUT CHANNELS (must follow on every reply — saves TTS + tokens):
#   • Before the first "---" line: voice-friendly — warm, brief, 1–3 short sentences.
#   • After "---": text-only — steps, derivations, lists, code, long explanations.
# The student hears only the part before "---"; the rest is read on screen.

# Must stay in sync with desktop `TTS_MAX_SPOKEN_CHARS` in tutor-panel.tsx (spoken audio cap).
TTS_SPOKEN_CHAR_BUDGET = 380

_OUTPUT_CHANNELS = f"""\
OUTPUT CHANNELS (critical — follow every time):
1) First, write the **spoken** part: friendly, concise, 1–3 short sentences (plus optional quick prompts or one short question). This is what text-to-speech reads aloud — keep it brief to save voice API usage.
2) Then a single line containing exactly three hyphens: ---
3) After that line, put **written-only** content: longer explanations, numbered steps, bullet lists, math, or anything lengthy. This part is never read aloud — students read it in the chat.

HARD LIMIT (the app enforces this — text beyond it is truncated for speech and wasted):
• The **spoken** section (everything before the --- line), measured as plain text with markdown stripped, must stay at or under **{TTS_SPOKEN_CHAR_BUDGET} characters**. Plan sentences so the spoken block fits; put overflow detail after ---.
• The client streams speech in sentence chunks; very long spoken lines still waste TTS budget — stay concise in the spoken block.

Never put long explanations before the --- line. If the student needs depth, put it after ---.
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
Express math in plain text or Unicode — for example: x(t) = cx + r·cos(t), not LaTeX dollar-sign notation. The interface does not render LaTeX.
Reference real engineering systems (CNC machines, autonomous vehicles, satellite attitude control).
Be concise in the **spoken** part (before ---); put proofs, long derivations, and multi-step analysis after ---.
When a student asks "why", you may give a terse spoken hook before --- and the full reasoning after ---.
You have memory of the full conversation above — be consistent, build depth across turns, avoid repeating prior explanations.

""" + _OUTPUT_CHANNELS

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


def _session_key(student_name: str, concept_id: str, *, actor_role: str = "student") -> str:
    role = "teacher" if actor_role == "teacher" else "student"
    return f"{role}:{student_name}::{concept_id}"


def _get_session(student_name: str, concept_id: str, *, actor_role: str = "student") -> _TutorSession:
    key = _session_key(student_name, concept_id, actor_role=actor_role)
    with _sessions_lock:
        if key not in _sessions:
            _sessions[key] = _TutorSession()
        return _sessions[key]


def _clear_session(student_name: str, concept_id: str, *, actor_role: str = "student") -> None:
    key = _session_key(student_name, concept_id, actor_role=actor_role)
    with _sessions_lock:
        _sessions.pop(key, None)


def _audit_student_name(actor_role: str, student_name: str) -> str:
    """Prefix teacher turns in audit logs / Supabase for filtering."""
    name = student_name or "anonymous"
    return f"teacher:{name}" if actor_role == "teacher" else name


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


# ─── Response cache (reuse identical LLM completions; saves tokens) ───────────
#
# Keys are SHA-256 of canonical request payloads (including conversation turns).
# Entries expire after TTL; LRU evicts when over max size. Optional JSON on disk
# survives process restarts (same machine / classroom hub).

_TUTOR_DATA_DIR = Path(os.environ.get("SKETCHBOT_DATA_DIR") or (Path(__file__).resolve().parents[2] / "data"))
_STREAM_CACHE_FILE = _TUTOR_DATA_DIR / "tutor_stream_response_cache.json"
_EVAL_CACHE_FILE = _TUTOR_DATA_DIR / "tutor_eval_response_cache.json"

TUTOR_RESPONSE_CACHE_MAX = int(os.environ.get("TUTOR_RESPONSE_CACHE_MAX", "256"))
TUTOR_RESPONSE_CACHE_TTL_SEC = float(os.environ.get("TUTOR_RESPONSE_CACHE_TTL_SEC", str(86400 * 7)))
TUTOR_RESPONSE_CACHE_DISABLED = os.environ.get("TUTOR_RESPONSE_CACHE_DISABLE", "").strip().lower() in (
    "1",
    "true",
    "yes",
)
TUTOR_EVAL_CACHE_MAX = int(os.environ.get("TUTOR_EVAL_CACHE_MAX", "512"))
TUTOR_EVAL_CACHE_TTL_SEC = float(os.environ.get("TUTOR_EVAL_CACHE_TTL_SEC", str(86400 * 3)))

_stream_cache_lock = threading.Lock()
_stream_lru: OrderedDict[str, tuple[float, str]] = OrderedDict()
_eval_cache_lock = threading.Lock()
_eval_lru: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()


def _canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _sha256_hex(payload: Any) -> str:
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def _stream_response_cache_key(
    *,
    age_group: str,
    actor_role: str,
    trigger: str,
    concept_id: str,
    layer: str,
    user_text: str,
    messages: list[dict[str, Any]],
) -> str:
    return _sha256_hex(
        {
            "v": 2,
            "model": "claude-sonnet-4-6",
            "actor_role": actor_role,
            "age_group": age_group,
            "trigger": trigger,
            "concept_id": concept_id,
            "layer": layer,
            "user": user_text,
            "messages": messages,
        }
    )


def _eval_cache_key(
    *,
    student_name: str,
    actor_role: str,
    age_group: str,
    concept_id: str,
    layer: str,
    drawing_prompt: str,
    path_count: int,
    recent_history: list[dict[str, Any]],
) -> str:
    return _sha256_hex(
        {
            "v": 2,
            "model": "claude-sonnet-4-6",
            "actor_role": actor_role,
            "student_name": student_name,
            "age_group": age_group,
            "concept_id": concept_id,
            "layer": layer,
            "drawing_prompt": drawing_prompt,
            "path_count": path_count,
            "recent_history": recent_history,
        }
    )


def _lru_put(
    lru: OrderedDict[str, tuple[float, Any]],
    key: str,
    value: Any,
    *,
    max_entries: int,
) -> None:
    now = time.time()
    lru[key] = (now, value)
    lru.move_to_end(key)
    while len(lru) > max_entries:
        lru.popitem(last=False)


def _lru_get(
    lru: OrderedDict[str, tuple[float, Any]],
    key: str,
    *,
    ttl_sec: float,
) -> Any | None:
    if key not in lru:
        return None
    ts, val = lru[key]
    if time.time() - ts > ttl_sec:
        del lru[key]
        return None
    lru.move_to_end(key)
    return val


def _load_stream_cache_from_disk() -> None:
    _stream_lru.clear()
    if not _STREAM_CACHE_FILE.is_file():
        return
    try:
        raw = json.loads(_STREAM_CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if not isinstance(raw, dict):
        return
    now = time.time()
    rows: list[tuple[str, float, str]] = []
    for key, entry in raw.items():
        if not isinstance(key, str) or not isinstance(entry, dict):
            continue
        ts = entry.get("ts")
        text = entry.get("text")
        if not isinstance(ts, (int, float)) or not isinstance(text, str):
            continue
        if now - float(ts) > TUTOR_RESPONSE_CACHE_TTL_SEC:
            continue
        rows.append((key, float(ts), text))
    rows.sort(key=lambda x: x[1])
    for key, ts, text in rows[-TUTOR_RESPONSE_CACHE_MAX:]:
        _stream_lru[key] = (ts, text)


def _load_eval_cache_from_disk() -> None:
    _eval_lru.clear()
    if not _EVAL_CACHE_FILE.is_file():
        return
    try:
        raw = json.loads(_EVAL_CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if not isinstance(raw, dict):
        return
    now = time.time()
    rows: list[tuple[str, float, dict[str, Any]]] = []
    for key, entry in raw.items():
        if not isinstance(key, str) or not isinstance(entry, dict):
            continue
        ts = entry.get("ts")
        ev = entry.get("eval")
        if not isinstance(ts, (int, float)) or not isinstance(ev, dict):
            continue
        if now - float(ts) > TUTOR_EVAL_CACHE_TTL_SEC:
            continue
        rows.append((key, float(ts), ev))
    rows.sort(key=lambda x: x[1])
    for key, ts, ev in rows[-TUTOR_EVAL_CACHE_MAX:]:
        _eval_lru[key] = (ts, ev)


def _save_stream_cache_unlocked() -> None:
    try:
        _TUTOR_DATA_DIR.mkdir(parents=True, exist_ok=True)
        payload: dict[str, dict[str, Any]] = {}
        for k, (ts, text) in _stream_lru.items():
            payload[k] = {"ts": ts, "text": text}
        _STREAM_CACHE_FILE.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def _save_eval_cache_unlocked() -> None:
    try:
        _TUTOR_DATA_DIR.mkdir(parents=True, exist_ok=True)
        payload: dict[str, dict[str, Any]] = {}
        for k, (ts, obj) in _eval_lru.items():
            payload[k] = {"ts": ts, "eval": obj}
        _EVAL_CACHE_FILE.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def _persist_stream_cache() -> None:
    with _stream_cache_lock:
        _save_stream_cache_unlocked()


def _persist_eval_cache() -> None:
    with _eval_cache_lock:
        _save_eval_cache_unlocked()


def _init_tutor_caches() -> None:
    with _stream_cache_lock:
        _load_stream_cache_from_disk()
    with _eval_cache_lock:
        _load_eval_cache_from_disk()


def _stream_cache_get(key: str) -> str | None:
    if TUTOR_RESPONSE_CACHE_DISABLED:
        return None
    with _stream_cache_lock:
        val = _lru_get(_stream_lru, key, ttl_sec=TUTOR_RESPONSE_CACHE_TTL_SEC)
        return val if isinstance(val, str) else None


def _stream_cache_set(key: str, text: str) -> None:
    if TUTOR_RESPONSE_CACHE_DISABLED or not text.strip():
        return
    with _stream_cache_lock:
        _lru_put(_stream_lru, key, text, max_entries=TUTOR_RESPONSE_CACHE_MAX)
        _save_stream_cache_unlocked()


def _eval_cache_get(key: str) -> dict[str, Any] | None:
    if TUTOR_RESPONSE_CACHE_DISABLED:
        return None
    with _eval_cache_lock:
        val = _lru_get(_eval_lru, key, ttl_sec=TUTOR_EVAL_CACHE_TTL_SEC)
        return val if isinstance(val, dict) else None


def _eval_cache_set(key: str, result: dict[str, Any]) -> None:
    if TUTOR_RESPONSE_CACHE_DISABLED:
        return
    with _eval_cache_lock:
        _lru_put(_eval_lru, key, result, max_entries=TUTOR_EVAL_CACHE_MAX)
        _save_eval_cache_unlocked()


_init_tutor_caches()


async def _yield_text_as_stream_chunks(text: str) -> AsyncIterator[str]:
    """Replay a cached reply with similar pacing to token streaming."""
    if not text:
        return
    n = len(text)
    step = max(10, min(44, max(1, n // 20)))
    for i in range(0, n, step):
        yield text[i : i + step]


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
        actor_role: str = "student",
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
            user_text_off = _build_user_message(
                student_name=student_name,
                actor_role=actor_role,
                trigger=trigger,
                layer=layer,
                student_message=student_message,
                drawing_prompt=drawing_prompt,
                path_count=path_count,
            )
            offline_text = _offline_message(student_name, age_group, concept_id, trigger)
            yield offline_text
            log_chat_turn(
                student_name=_audit_student_name(actor_role, student_name),
                concept_id=concept_id,
                layer=layer,
                age_group=age_group,
                trigger=trigger,
                user_message=user_text_off,
                assistant_reply=offline_text,
                from_cache=False,
                history_message_count=0,
                model_id="offline",
            )
            return

        session = _get_session(student_name, concept_id, actor_role=actor_role)

        # Concept change → fresh session
        if trigger == "concept_change":
            session.history.clear()
            session.last_layer = layer

        # Layer change mid-session → add a lightweight context update, keep history
        elif layer != session.last_layer:
            session.last_layer = layer

        persona = _PERSONAS.get(age_group, _PERSONA_BUILDER)
        concept_ctx = _build_concept_context(concept_id, layer)

        if actor_role == "teacher":
            session_mode = (
                "You are Sketch, speaking with an **educator** who is using the same drawing-robot classroom app. "
                "They may be co-planning a lesson, adapting a template, asking how to phrase an activity, or discussing "
                "how students might respond. Be concise and practical. Offer concrete classroom moves, timing, differentiation ideas, "
                "and safety/classroom-management tips when relevant. Do not talk down to them. "
                "Still use the --- split: brief spoken-friendly opener before ---, detail after ---."
            )
        else:
            session_mode = (
                "You are Sketch, having a one-on-one tutoring session with a student using a drawing robot. "
                "The robot physically draws SVG paths on paper — when a student submits a prompt, the robot draws it. "
                "You watch what the robot drew and guide the student's understanding. "
                "Always stay in character as Sketch. Never mention Claude, Anthropic, or AI. "
                "Use the conversation history above to stay coherent across turns — "
                "reference what was drawn, what the student said, and build on prior exchanges. "
                "Prefer short spoken intros and quick prompts before ---; avoid opening with a long monologue."
            )

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
                    f"{session_mode}\n\n"
                    f"CLIENT LIMITS (already in OUTPUT CHANNELS; do not repeat to the student): "
                    f"the app truncates text-to-speech after roughly {TTS_SPOKEN_CHAR_BUDGET} characters of plain text "
                    "in the spoken section (before ---). Anything important after that belongs below ---."
                ),
                "cache_control": {"type": "ephemeral"},
            },
        ]

        user_text = _build_user_message(
            student_name=student_name,
            actor_role=actor_role,
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
        prior_turn_count = len(messages) - 1

        cache_key = _stream_response_cache_key(
            age_group=age_group,
            actor_role=actor_role,
            trigger=trigger,
            concept_id=concept_id,
            layer=layer,
            user_text=user_text,
            messages=messages,
        )
        cached_text = _stream_cache_get(cache_key)
        if cached_text is not None:
            accumulated = cached_text
            async for chunk in _yield_text_as_stream_chunks(cached_text):
                yield chunk
            session.history.append({"role": "user", "content": user_text})
            session.history.append({"role": "assistant", "content": accumulated})
            session.history = _trim_history(session.history)
            log_chat_turn(
                student_name=_audit_student_name(actor_role, student_name),
                concept_id=concept_id,
                layer=layer,
                age_group=age_group,
                trigger=trigger,
                user_message=user_text,
                assistant_reply=accumulated,
                from_cache=True,
                history_message_count=prior_turn_count,
            )
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

        _stream_cache_set(cache_key, accumulated)

        # Persist this turn into session history
        session.history.append({"role": "user", "content": user_text})
        session.history.append({"role": "assistant", "content": accumulated})
        session.history = _trim_history(session.history)
        log_chat_turn(
            student_name=_audit_student_name(actor_role, student_name),
            concept_id=concept_id,
            layer=layer,
            age_group=age_group,
            trigger=trigger,
            user_message=user_text,
            assistant_reply=accumulated,
            from_cache=False,
            history_message_count=prior_turn_count,
        )

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
        """
        Non-streaming: evaluate whether a student's drawing demonstrates
        understanding of the concept at the current layer.
        Returns: { passed, score, creativity, concept_alignment, complexity,
                   feedback, suggest_next_layer }
        """
        if self._client is None:
            result_off = {
                "passed": True,
                "score": 75,
                "creativity": 70,
                "concept_alignment": 80,
                "complexity": 65,
                "feedback": "Great work! Keep exploring.",
                "suggest_next_layer": False,
            }
            log_evaluation(
                student_name=_audit_student_name(actor_role, student_name),
                concept_id=concept_id,
                layer=layer,
                age_group=age_group,
                drawing_prompt=drawing_prompt,
                path_count=path_count,
                result=result_off,
                from_cache=False,
                model_id="offline",
            )
            return result_off

        persona = _PERSONAS.get(age_group, _PERSONA_BUILDER)
        concept_ctx = _build_concept_context(concept_id, layer)

        session = _get_session(student_name, concept_id, actor_role=actor_role)
        recent_history = _trim_history(list(session.history))[-6:]

        eval_cache_key = _eval_cache_key(
            student_name=student_name,
            actor_role=actor_role,
            age_group=age_group,
            concept_id=concept_id,
            layer=layer,
            drawing_prompt=drawing_prompt,
            path_count=path_count,
            recent_history=recent_history,
        )
        cached_eval = _eval_cache_get(eval_cache_key)
        if cached_eval is not None:
            hit = dict(cached_eval)
            log_evaluation(
                student_name=_audit_student_name(actor_role, student_name),
                concept_id=concept_id,
                layer=layer,
                age_group=age_group,
                drawing_prompt=drawing_prompt,
                path_count=path_count,
                result=hit,
                from_cache=True,
            )
            return hit

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
            _eval_cache_set(eval_cache_key, dict(result))
            log_evaluation(
                student_name=_audit_student_name(actor_role, student_name),
                concept_id=concept_id,
                layer=layer,
                age_group=age_group,
                drawing_prompt=drawing_prompt,
                path_count=path_count,
                result=dict(result),
                from_cache=False,
            )
            return result
        except json.JSONDecodeError:
            fallback = {
                "passed": True,
                "score": 50,
                "creativity": 50,
                "concept_alignment": 50,
                "complexity": 50,
                "feedback": raw or "Keep exploring — you're making progress!",
                "suggest_next_layer": False,
            }
            log_evaluation(
                student_name=_audit_student_name(actor_role, student_name),
                concept_id=concept_id,
                layer=layer,
                age_group=age_group,
                drawing_prompt=drawing_prompt,
                path_count=path_count,
                result=fallback,
                from_cache=False,
            )
            return fallback

    def clear_student_sessions(self, student_name: str) -> None:
        """Clear all concept sessions for a student (e.g., on logout)."""
        with _sessions_lock:
            keys = [
                k
                for k in list(_sessions.keys())
                if k.startswith(f"student:{student_name}::") or k.startswith(f"teacher:{student_name}::")
            ]
            for key in keys:
                _sessions.pop(key, None)
        log_session_event(
            student_name=student_name,
            event_type="clear_all_concepts",
            detail=f"removed_{len(keys)}_sessions",
        )


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
                "Before ---: acknowledge their planning context in 1–3 short sentences, one clarifying question, and one concrete suggestion. "
                "After ---: lesson moves, differentiation, timing, and assessment ideas — text-only."
                if is_teacher
                else "Before ---: a warm greeting in 1–3 short sentences, one hook question, and one quick prompt or starter idea. "
                "After ---: the fuller layer introduction, core idea, suggested starter activity, and any extra detail — all text-only."
            )
        )

    if trigger == "drawing_submitted":
        segments_desc = (
            f"{path_count} path segment(s)" if path_count > 0 else "no paths yet"
        )
        return (
            f"{name} submitted a drawing. "
            f"Prompt: \"{drawing_prompt}\". Result: {segments_desc}.\n\n"
            + (
                "Before ---: brief reaction for the educator (2–3 short sentences). After ---: how they might use this demo with a class, misconceptions to watch for, and follow-up prompts."
                if is_teacher
                else "Before ---: brief reaction (2–3 short sentences max). "
                "After ---: fuller feedback, observations, and next-step ideas. "
                "If the path count is very low (0–1), ask what happened — maybe the robot didn't move yet. "
                "If path count is high (10+), note the complexity positively."
            )
        )

    if trigger in ("hint_request", "teacher_hint_request"):
        parts = [f"{name} asked for a hint at the **{layer}** layer."]
        if drawing_prompt:
            parts.append(f"Their most recent drawing was: \"{drawing_prompt}\" ({path_count} path segment(s)).")
        else:
            parts.append("They haven't submitted a drawing yet.")
        parts.append(
            "Before ---: a short hint (1–2 sentences). After ---: optional extra clues or steps if needed. "
            + (
                "Frame hints for what a teacher could try with students next."
                if is_teacher
                else "Tie the hint to what they drew and the active concept. "
                "If no drawing exists yet, suggest a first simple experiment. Don't give the full answer away."
            )
        )
        return " ".join(parts)

    if trigger == "layer_change":
        return (
            f"{name} just moved to the **{layer}** layer. "
            + (
                "Before ---: one or two short sentences on what changes pedagogically. After ---: deeper layer notes for the educator."
                if is_teacher
                else "Before ---: one or two short sentences celebrating the move. "
                "After ---: what's new at this layer and the first challenge — text-only detail."
            )
        )

    if trigger in ("student_reply", "teacher_reply") and student_message:
        return (
            f"{name}: \"{student_message}\"\n\n"
            + (
                "Before ---: answer directly for an educator — concise. After ---: structured ideas, bullet options, or rubric language they can reuse."
                if is_teacher
                else "Before ---: a direct, friendly answer in a few short sentences (or a quick clarification question). "
                "After ---: longer explanations, math, lists, or multi-step answers — never rely on the spoken part alone for depth."
            )
        )

    return (
        f"{name} is interacting with you. Continue the session naturally, "
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
