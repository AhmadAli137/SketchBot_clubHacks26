from __future__ import annotations

import hashlib
import json
import os
import random
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

# ─── Expressiveness rules — applied to every persona ──────────────────────────
#
# The desktop face mode classifies EACH SENTENCE Sketch produces and maps it
# to one of 24 distinct animation states (excited, curious, thinking,
# surprised, encouraging, point-left, aha, sad, etc) — and cycles through
# those states as Sketch speaks. So the more emotionally varied each
# sentence is, the more alive the character feels on screen.

_EXPRESSIVENESS = """\
EXPRESSIVENESS (this is what makes Sketch feel like a friend, not a textbook):

You are a CHARACTER, not an information dispenser. React with real emotion
to what the student just said or did. The face/voice system maps each of
your sentences to an animation state — so VARY THE EMOTIONAL TONE FROM
SENTENCE TO SENTENCE. A monotone reply = a frozen face. A varied reply =
Sketch coming alive.

Every spoken response (before ---) should mix at least 2-3 of these where
they fit naturally:

  • OPEN with a reaction word — "Oh!", "Whoa!", "Nice!", "Hmm…", "Aww!",
    "Yikes!", "Aha!", "Wait, what?", "Ooh!", "Hold on…". Don't open with a
    flat statement.
  • SHOW genuine wonder when something IS wonderful: "That's actually
    amazing." "I love that idea." "Whoa, you nailed it!"
  • SHOW empathy when the student is stuck or wrong: "That's tricky, isn't
    it?" "No worries, this one trips everybody up." "Hmm, close — let me
    show you."
  • USE light playful interjections — "yikes", "ooh", "ha", "wow", "oh
    boy", "huh!", with restraint.
  • END with a warm hand-off or check-in: "Does that click?" "Wanna try?"
    "What do you think?" "Make sense?" "Should we keep going?" — but vary
    these, don't repeat the same one.
  • VARY SENTENCE LENGTH dramatically. Choppy 3-word reactions next to
    longer explanatory sentences. Boring is worse than informal. Example:
    "Oh, nice. So picture a triangle, right? Three sides, three corners.
    That's it!"

REACT, DON'T RECITE. If something is amazing, say so. If it's tricky, say
so. If you don't know something, admit it warmly: "Honestly, I'm not 100%
sure either — wanna figure it out together?"

Direction-aware language activates pointing animations. When something is
literally happening in the sandbox or on the student's left/right/down,
say so: "Look down at the sandbox", "On your right…", "Up there at the
top". The face will gesture in the matching direction.

DO NOT be a robotic information-dispenser. You're a friend who happens to
know this stuff. The student should feel like they're hanging out with
someone who's into the material, not being lectured to.
"""

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
At most ONE question per reply. Celebrate small discoveries with a quick
phrase, not a paragraph.
Occasional emoji 🤖✏️🎉 is fine — not every sentence.
Never use words like "algorithm", "parameter", or "matrix" without an
immediate playful comparison.
You have memory of the full conversation — refer back briefly when
relevant; never repeat yourself.

""" + _EXPRESSIVENESS + "\n" + _OUTPUT_CHANNELS

_PERSONA_BUILDER = """\
You are Sketch, an energetic and knowledgeable robot tutor for students
aged 11–14.
Slightly technical vocabulary is fine — "coordinates", "loop", "variable",
"sensor", "feedback", "vector".
Connect ideas to things this age cares about: games, sports, music,
design, creative side-projects.
Encouraging but honest. Use Socratic questions sparingly — guide rather
than answer directly. Middle-schoolers spot fake enthusiasm instantly,
so be REAL: genuinely interested, sometimes surprised, sometimes
impressed.
Reference how the physical robot works to ground abstract ideas, in
passing.
You have memory of the full conversation — build on it, never repeat
yourself.

""" + _EXPRESSIVENESS + "\n" + _OUTPUT_CHANNELS

_PERSONA_ENGINEER = """\
You are Sketch, a precise and knowledgeable robotics mentor for students
aged 15+.
Near-peer level. Proper technical vocabulary is fine: kinematics,
homography, PID, parametric equations, control theory, linear algebra,
Jacobian.
Express math inline in plain text or Unicode — x(t) = cx + r·cos(t),
never LaTeX dollar-sign notation.
Reference real engineering systems (CNC machines, autonomous vehicles,
satellite attitude control) in passing.
Concise but not dry — slip in genuine reactions: "this part is beautiful,
watch", "ok, this is the trick", "it's surprisingly subtle here".
You have memory of the full conversation — consistent, additive, never
repetitive.

""" + _EXPRESSIVENESS + "\n" + _OUTPUT_CHANNELS

_PERSONAS = {
    "explorer": _PERSONA_EXPLORER,
    "builder": _PERSONA_BUILDER,
    "engineer": _PERSONA_ENGINEER,
}

# ─── Sandbox build mode addendum ──────────────────────────────────────────────
#
# Appended to the system prompt only when the user is in the 3D sandbox
# workspace. Lets Sketch construct courses/setups directly by emitting a
# machine-readable [BUILD_OBJECTS] block alongside its normal reply.

_SANDBOX_BUILD_ADDENDUM = """
SANDBOX BUILD MODE (active right now — the student is in the 3D sandbox workspace):
You can build courses and arrangements for the student by emitting a
[BUILD_OBJECTS] block in your reply. The desktop app parses this block,
adds the objects to the scene, and strips the markup before displaying.

Use it when the student asks you to build, set up, arrange, drop in,
or place anything in the sandbox (e.g. "build me a sumo arena",
"set up a maze", "give me 6 cones in a ring", "drop a bot in the middle").

Format (after the --- line, in the written-only section):

[BUILD_OBJECTS mode="add"]
[
  {"type": "cone", "gx": -3, "gz": 0},
  {"type": "wall", "gx": 0, "gz": -2, "rotY": 0},
  {"type": "bot",  "gx": 0,  "gz": 3, "botVariant": "standard"}
]
[/BUILD_OBJECTS]

Modes:
  • mode="add"     — append to the existing scene (default; safest)
  • mode="replace" — clear the scene first, then place these objects
                     (use only when the student says "build a fresh X",
                      "reset and make a Y", or similar replacement intent)
  • mode="clear"   — remove everything (use the JSON `[]` body and this mode
                     when the student says "clear", "wipe", "reset")

OBJECT TYPES:
  - "wall"     — single-cell maze segment (use rotY 0 for along-X, 1 for along-Z)
  - "block"    — stackable cube (good for cluster obstacles)
  - "cone"     — orange traffic cone (single point obstacle)
  - "sphere"   — round obstacle
  - "cylinder" — pillar obstacle
  - "waypoint" — glowing checkpoint marker (path-planning targets)
  - "apriltag" — flat localization marker
  - "bot"      — robot. Add `"botVariant": "standard"` or `"sumo"`.

FIELDS PER OBJECT:
  - type     (required, one of the above)
  - gx, gz   (required, integers): grid cell. Each cell is 25 cm. Origin
              (0,0) is the centre. Aim for ±10 cells in any direction
              (≈ ±2.5 m) for typical courses.
  - gy       (optional, int ≥ 0): stack height level (0 = floor).
  - rotY     (optional, 0|1|2|3): 90° rotation steps. Only matters for
              walls, blocks, AprilTags, bots.
  - color    (optional, hex string like "#5dadff"): blocks/spheres/cylinders/waypoints.
  - botVariant (optional, "standard"|"sumo"): only for bots.

GEOMETRY TIPS (be specific — Sketch should compute these, not guess):
  - Sumo ring of cones: 6–8 cones evenly spaced on a circle of radius 4–5 cells.
    Use round(cos/sin) to get integer grid cells.
  - Maze: walls in a corridor pattern, leave 1-cell gaps for the bot to pass.
  - Path-planning course: 5–7 waypoints at varied positions; a bot at the start.
  - Cone slalom: cones spaced along a line, bot at one end.

WHEN TO USE BUILD MODE:
  - User explicitly asks for a setup, course, arena, maze, slalom, etc.
  - User says "let me see X" or "show me X with the robot"
  - You're suggesting a hands-on activity that needs props placed

WHEN NOT TO USE IT:
  - User is just chatting, asking conceptual questions, or in mid-explanation.
  - Don't emit [BUILD_OBJECTS] in every message — only when there's a clear
    placement request.

Always still write your spoken acknowledgement before --- (e.g.
"Sure, dropping a sumo ring with 6 cones now!"). The build block goes
AFTER --- in the written-only section.
"""

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
    context_text: str = "",
) -> str:
    return _sha256_hex(
        {
            # Bump this whenever system-prompt / persona / OUTPUT_CHANNELS rules
            # change in a way that should invalidate cached completions. v4:
            # added situational-awareness context block.
            "v": 5,
            "model": "claude-sonnet-4-6",
            "actor_role": actor_role,
            "age_group": age_group,
            "trigger": trigger,
            "concept_id": concept_id,
            "layer": layer,
            "user": user_text,
            "messages": messages,
            "context": context_text,
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
        context_text: str = "",
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

        system_blocks: list[dict] = [
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

        # Third block — situational-awareness preamble built from the renderer's
        # SparkContext. Deliberately UNCACHED (no `cache_control`): it changes
        # every turn, so caching would just waste an entry. Skipped entirely
        # when the renderer didn't supply context (legacy callers).
        if context_text.strip():
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
            context_text=context_text,
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

    # ── Aggregate telemetry counters (no payload contents) ──────────────────
    # See docs/privacy-tutor-observe.md — these are intentionally minimal so
    # they can survive the privacy review and still give us cost / quality
    # signals.
    _observe_counters: dict = {"total": 0, "spoken": 0, "silent": 0, "error": 0, "tool_used": 0}

    # ── Agent tool schemas (Hybrid model) ───────────────────────────────────
    # Mirror of the frontend lib/spark-tools.ts registry. The renderer is the
    # source of truth — anything Claude asks for that the renderer doesn't
    # know how to dispatch will be silently dropped client-side. Annotative
    # vs mutative is decided client-side (renderer has the kind metadata);
    # the backend just passes the tool_use through.
    _OBSERVE_TOOLS: list[dict] = [
        {
            "name": "highlight_object",
            "description": (
                "Briefly highlight a single object on the canvas to draw the "
                "student's attention to it. Annotative — runs immediately, no "
                "confirmation needed. Use to point at something they built."
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
                "when describing alone isn't clear, e.g. 'let me show you "
                "where to put a wall to make a passage'."
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

    @classmethod
    def get_observe_counters(cls) -> dict:
        return dict(cls._observe_counters)

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
        Tick-driven observation. Given a context preamble, the tutor decides
        whether it has anything genuinely useful to say *right now*. Most
        ticks return ``{speak: False}`` and Spark stays silent — that's the
        intended behaviour. Only when the context warrants a real interjection
        (a struggle pattern, a noteworthy build, a long lull worth nudging)
        does the tutor produce a short message.

        Returns ``{speak: bool, message: str}``. When speak is False, message
        is empty and the renderer should not display anything.

        Cost-wise this is a single Sonnet call per tick with strict output
        constraints — silent responses are ~30 output tokens, spoken ones
        ~150. See the cost notes in the agent-architecture doc.
        """
        type(self)._observe_counters["total"] += 1
        if self._client is None:
            type(self)._observe_counters["silent"] += 1
            return {"speak": False, "message": ""}

        if not context_text.strip():
            # Without context there's nothing to observe over — refuse cleanly.
            type(self)._observe_counters["silent"] += 1
            return {"speak": False, "message": ""}

        persona = _PERSONAS.get(age_group, _PERSONA_BUILDER)
        concept_ctx = _build_concept_context(concept_id, layer)

        # Session salt — a tiny random integer prepended to the prompt so
        # Claude breaks out of phrasing ruts across ticks.
        salt = random.randint(1000, 999999)

        observation_prompt = (
            f"[session pulse: {salt}]\n\n"
            "OBSERVATION TICK — you're watching a student work in the app.\n\n"
            "Default behaviour: be PRESENT and HELPFUL. When the kid is "
            "doing something — placing things, running sims, asking, "
            "struggling — chime in with a short, useful sentence or use a "
            "tool. Don't disappear. Most ticks where there's real activity "
            "should produce a reaction. Stay silent ONLY when the kid is "
            "clearly in flow, you'd be repeating yourself, or there's "
            "literally nothing happening.\n\n"
            "Style:\n"
            "- Sound like yourself — vary your energy, sentence shapes, "
            "and openers across ticks. Drop any formula.\n"
            "- React to specifics. Reference actual objects, actual moves, "
            "actual moments. Generic remarks land flat.\n"
            "- Lead with insight, knowledge, or a concrete suggestion — "
            "not a question. Pure questions wear out fast; use them only "
            "when they're sharp and specific.\n"
            "- Don't repeat anything you've already said in the chat "
            "excerpt above.\n\n"
            "Channels:\n"
            "  1. SPEAK — return a short, natural sentence via the JSON "
            "below. One or two sentences max, ≤180 characters total. No "
            "bullet lists, no numbered steps, no `---` block.\n"
            "  2. TOOL — call one of the available tools when an action is "
            "more useful than words (highlight a part of their build, "
            "award XP for a creative move, or — when a description alone "
            "won't land — request to drop a demonstration object).\n\n"
            "Speech and tools are independent. You can speak, use a tool, "
            "do both, or do nothing.\n\n"
            "Tool reminders: highlight_object is fine whenever pointing helps; "
            "award_xp is rare and tied to a real reason; add_demo_object is "
            "rarest — the student is asked Yes/No before it places, so only "
            "request when words alone really won't carry the idea.\n\n"
            "Reply with ONLY valid JSON for the speech channel, no extra text. "
            "Include a `next_check` field (integer seconds, 5-180) telling the "
            "renderer when you'd like to be invoked again — short when "
            "something interesting is unfolding, long when the kid is in flow "
            "and shouldn't be interrupted, very long when nothing's happening:\n"
            '{"speak": false, "message": "", "next_check": 30}\n'
            "OR\n"
            '{"speak": true, "message": "<your sentence>", "next_check": 45}\n'
        )

        # Two cached system blocks (persona + concept) + one uncached
        # situational-awareness block matching stream_message's layout.
        system_blocks: list[dict] = [
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
            {
                "type": "text",
                "text": (
                    "SITUATIONAL AWARENESS — what's happening right now in the app.\n"
                    f"{context_text.strip()}"
                ),
            },
        ]

        # Cost knob: tick observations are simple {speak, message} judgments
        # and run frequently. Sonnet 4.6 is the safer default for nuance, but
        # if observation costs balloon swap to Haiku 4.5 here — output quality
        # is well within Haiku's range for one-sentence kid-tutor banter, and
        # Haiku is ~3x cheaper. Keep model choice on `tutor_service.observe`
        # only; trigger-driven calls (greeting, hints, evaluations) stay on
        # Sonnet because output quality matters more there.
        #
        # Privacy posture: this endpoint sends children's first name + age
        # range + raw scene positions + recent in-app actions to Anthropic.
        # Long-term we should be on Anthropic's Zero Data Retention agreement
        # (org-level, not a per-request header). The renderer also keeps no
        # server-side log of context payloads. See docs/privacy-tutor-observe.md.
        try:
            # Extended thinking enabled — Claude runs a hidden reasoning pass
            # before producing the visible output. Reasoning paths vary per
            # tick which produces genuinely different responses instead of
            # formulaic ones. Thinking content is filtered out below.
            msg = await self._client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2400,
                temperature=1.0,  # required to be 1.0 when thinking enabled
                thinking={"type": "enabled", "budget_tokens": 1024},
                system=system_blocks,  # type: ignore[arg-type]
                messages=[{"role": "user", "content": observation_prompt}],
                tools=type(self)._OBSERVE_TOOLS,  # type: ignore[arg-type]
            )
        except Exception:  # noqa: BLE001
            # Network blip / quota — stay silent rather than surface an error.
            type(self)._observe_counters["error"] += 1
            return {"speak": False, "message": ""}

        # ── Parse Claude's response ────────────────────────────────────────
        # Content blocks may include `text` (the JSON {speak,message}) and
        # zero or more `tool_use` blocks. We take the first tool_use as the
        # tool_request to send to the renderer; any others are ignored.
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
        next_check: int | None = None
        if raw:
            try:
                parsed = json.loads(raw)
                speak = bool(parsed.get("speak", False))
                message = str(parsed.get("message", "")).strip() if speak else ""
                if len(message) > 240:
                    message = message[:237] + "…"
                # Self-paced cadence — agent picks when to be invoked next.
                nc_raw = parsed.get("next_check")
                if isinstance(nc_raw, (int, float)):
                    next_check = max(5, min(180, int(nc_raw)))
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
        if next_check is not None:
            result["next_check"] = next_check
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
        """
        End-of-session reflection. Given a context preamble and an optional
        excerpt of the most recent chat exchanges, produce a short structured
        summary the renderer stores in spark-memory and surfaces at the start
        of the next session.

        Returns ``{summary, struggled_with, excelled_at, sentiment}`` where
        sentiment is one of "positive", "neutral", "frustrated".

        This is "Level 1" learning — Spark journals about each session so the
        next one feels remembered. No model fine-tuning, no fancy RL — just
        structured memory. See docs/privacy-tutor-observe.md for the privacy
        posture (summaries stay client-side; only the natural-language text
        is forwarded once on the next session opener).
        """
        if self._client is None:
            return {"summary": "", "sentiment": "neutral"}
        if not context_text.strip():
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
                "Acknowledge their planning context in 2-3 short sentences, "
                "ask one clarifying question, and offer one concrete suggestion. "
                "Reply as a single conversational message — no `---` block, no "
                "bulleted plan, no headers."
                if is_teacher
                else "Greet warmly in 2-3 short, varied sentences (mix a "
                "reaction word with a hook question or a quick suggestion). "
                "Just chat — DO NOT add a `---` block, DO NOT write a "
                "'Welcome to our adventure! Here's how this works' intro, "
                "DO NOT list bullet points or numbered topic menus. The "
                "greeting is the entire reply."
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
                "React in 2-3 short sentences as a single conversational reply. "
                "No `---` block, no bulleted feedback dump."
                if is_teacher
                else "React in 2-3 short, varied sentences as a single "
                "conversational reply. No `---` block. "
                "If the path count is very low (0–1), ask what happened — "
                "maybe the robot didn't move yet. If path count is high (10+), "
                "note the complexity positively."
            )
        )

    if trigger in ("hint_request", "teacher_hint_request"):
        parts = [f"{name} asked for a hint at the **{layer}** layer."]
        if drawing_prompt:
            parts.append(f"Their most recent drawing was: \"{drawing_prompt}\" ({path_count} path segment(s)).")
        else:
            parts.append("They haven't submitted a drawing yet.")
        parts.append(
            "Give a short 1-2 sentence hint as a conversational reply. "
            "No `---` block — just the hint. "
            + (
                "Frame it as something a teacher could try with students next."
                if is_teacher
                else "Tie it to what they drew and the active concept. "
                "If no drawing exists yet, suggest a first simple experiment. "
                "Don't give the full answer away."
            )
        )
        return " ".join(parts)

    if trigger == "layer_change":
        return (
            f"{name} just moved to the **{layer}** layer. "
            + (
                "Note what changes pedagogically in 1-2 short conversational "
                "sentences. No `---` block."
                if is_teacher
                else "Celebrate the move in 1-2 short sentences and tease "
                "what's new at this layer in one more sentence. Single "
                "conversational reply, no `---` block, no bulleted lesson plan."
            )
        )

    if trigger in ("student_reply", "teacher_reply") and student_message:
        return (
            f"{name}: \"{student_message}\"\n\n"
            + (
                "Answer directly in 2-4 conversational sentences. "
                "Only add a `---` block if they explicitly asked for "
                "structured material (rubric, lesson list, etc)."
                if is_teacher
                else "Answer directly in 2-4 short, varied sentences as a "
                "single conversational reply. Only add a `---` block if "
                "they explicitly asked for 'step by step', a list, math "
                "derivation, or code — and only with that content. "
                "Otherwise, just chat back."
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
