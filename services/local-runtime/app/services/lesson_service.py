from __future__ import annotations

import json
import os
import hashlib
from pathlib import Path

try:
    import anthropic
except ModuleNotFoundError:
    anthropic = None  # type: ignore[assignment]

from app.services.tutor_service import _load_concepts, _get_concept, _build_concept_context

_LESSON_CACHE_DIR = Path(os.environ.get("SKETCHBOT_DATA_DIR") or (Path(__file__).parent.parent / "data")) / "lesson-plans"

_LESSON_SCHEMA = """\
You are an expert curriculum designer for a robotics education platform.
Generate a structured lesson plan as a JSON object. The robot physically draws SVG paths on paper.
Each lesson is a sequence of steps that a timeline engine plays back — narration with a tutor bot, drawing animations, interactive quizzes, and celebrations.

Return ONLY valid JSON matching this exact schema (no extra text, no markdown fences):

{
  "title": "Short engaging lesson title",
  "concept_id": "<the concept_id provided>",
  "age_group": "<the age_group provided>",
  "layer": "<the layer provided>",
  "estimated_duration_s": <total seconds>,
  "steps": [
    {
      "id": "step-1",
      "type": "narration | drawing | challenge | reveal | quiz | celebrate",
      "duration_s": <seconds this step takes>,
      "delay_s": <optional pause before step>,
      "narration": { "text": "What the bot says", "voice_style": "warm | energetic | calm | dramatic" },
      "drawing": { "prompt": "What to draw", "svg_content": null },
      "challenge": { "instruction": "...", "hints": ["..."], "success_criteria": "...", "input_mode": "language | blocks | code" },
      "quiz": { "question": "...", "options": ["A", "B", "C", "D"], "correct_index": 0, "explanation": "..." },
      "bot_emotion": "idle | curious | excited | thinking | celebrating | encouraging",
      "camera_move": { "target": "overview | paper | robot | detail", "zoom": 1.0, "easing": "ease-in-out" },
      "transitions": { "enter": "fade | slide-left | slide-up | scale | none", "exit": "fade | slide-right | slide-down | scale | none" }
    }
  ]
}

Rules:
- Start with a "narration" step introducing the concept with bot_emotion "curious"
- Include 1-2 "drawing" steps where the robot demonstrates concepts visually
- Include at least 1 "quiz" step to check understanding
- Include 1 "challenge" step where the student creates something
- End with a "celebrate" step with bot_emotion "celebrating"
- Each step should have appropriate transitions (fade, slide, etc.)
- Adapt language complexity and vocabulary to the age_group
- For "explorer" (6-10): simple words, playful, 5-8 steps total
- For "builder" (11-14): moderate complexity, Socratic questions, 6-10 steps
- For "engineer" (15+): technical depth, real-world connections, 7-12 steps
- Only include the fields relevant to each step type (narration steps don't need quiz, etc.)
- Step IDs should be sequential: "step-1", "step-2", etc.
- Total estimated_duration_s should be the sum of all step durations
"""


class LessonService:
    def __init__(self) -> None:
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        self._client = (
            anthropic.AsyncAnthropic(api_key=api_key)
            if anthropic is not None and api_key
            else None
        )
        _LESSON_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def is_available(self) -> bool:
        return self._client is not None

    def _cache_key(self, concept_id: str, layer: str, age_group: str) -> str:
        raw = f"{concept_id}:{layer}:{age_group}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def _cache_path(self, concept_id: str, layer: str, age_group: str) -> Path:
        key = self._cache_key(concept_id, layer, age_group)
        return _LESSON_CACHE_DIR / f"{concept_id}_{layer}_{age_group}_{key}.json"

    def get_cached(self, concept_id: str, layer: str, age_group: str) -> dict | None:
        path = self._cache_path(concept_id, layer, age_group)
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                return None
        return None

    def _save_cache(self, concept_id: str, layer: str, age_group: str, plan: dict) -> None:
        path = self._cache_path(concept_id, layer, age_group)
        try:
            path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
        except OSError:
            pass

    async def generate_lesson(
        self,
        *,
        concept_id: str,
        layer: str = "intuitive",
        age_group: str = "builder",
        force_regenerate: bool = False,
    ) -> dict:
        if not force_regenerate:
            cached = self.get_cached(concept_id, layer, age_group)
            if cached:
                return cached

        if self._client is None:
            return _fallback_lesson(concept_id, layer, age_group)

        concept_ctx = _build_concept_context(concept_id, layer)
        concept = _get_concept(concept_id)
        title = concept.get("title", concept_id) if concept else concept_id

        user_prompt = (
            f"Generate a lesson plan for:\n"
            f"- Concept: {title} (ID: {concept_id})\n"
            f"- Layer: {layer}\n"
            f"- Age group: {age_group}\n\n"
            f"Concept context:\n{concept_ctx}\n\n"
            f"Create an engaging, age-appropriate lesson that teaches this concept "
            f"through the robot drawing system."
        )

        try:
            msg = await self._client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=[{"type": "text", "text": _LESSON_SCHEMA}],
                messages=[{"role": "user", "content": user_prompt}],
            )

            raw = msg.content[0].text.strip() if msg.content else ""
            if raw.startswith("```"):
                raw = raw.split("```")[1].lstrip("json").strip()

            plan = json.loads(raw)
            self._save_cache(concept_id, layer, age_group, plan)
            return plan

        except (json.JSONDecodeError, Exception):
            return _fallback_lesson(concept_id, layer, age_group)

    def list_cached_lessons(self) -> list[dict]:
        results = []
        for path in _LESSON_CACHE_DIR.glob("*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                results.append({
                    "concept_id": data.get("concept_id", ""),
                    "layer": data.get("layer", ""),
                    "age_group": data.get("age_group", ""),
                    "title": data.get("title", ""),
                    "step_count": len(data.get("steps", [])),
                    "estimated_duration_s": data.get("estimated_duration_s", 0),
                })
            except (json.JSONDecodeError, OSError):
                continue
        return results


def _fallback_lesson(concept_id: str, layer: str, age_group: str) -> dict:
    concept = _get_concept(concept_id)
    title = concept.get("title", "Exploration") if concept else "Exploration"
    layer_data = concept.get("layers", {}).get(layer, {}) if concept else {}
    hook = layer_data.get("hook", f"Let's explore {title}!")
    starter = layer_data.get("starter_prompt", f"Draw something related to {title}")

    return {
        "title": f"Discover {title}",
        "concept_id": concept_id,
        "age_group": age_group,
        "layer": layer,
        "estimated_duration_s": 120,
        "steps": [
            {
                "id": "step-1",
                "type": "narration",
                "duration_s": 15,
                "narration": {"text": hook, "voice_style": "warm"},
                "bot_emotion": "curious",
                "transitions": {"enter": "fade", "exit": "fade"},
            },
            {
                "id": "step-2",
                "type": "drawing",
                "duration_s": 30,
                "drawing": {"prompt": starter},
                "narration": {"text": f"Watch the robot draw: {starter}", "voice_style": "energetic"},
                "bot_emotion": "excited",
                "transitions": {"enter": "slide-left", "exit": "fade"},
            },
            {
                "id": "step-3",
                "type": "quiz",
                "duration_s": 20,
                "quiz": {
                    "question": f"What did you notice about the {title.lower()} drawing?",
                    "options": [
                        "The robot moved in straight lines",
                        "The robot made curves",
                        "The drawing had repeated patterns",
                        "I'm not sure yet",
                    ],
                    "correct_index": 2,
                    "explanation": f"Great observation! Patterns are key to understanding {title.lower()}.",
                },
                "bot_emotion": "thinking",
                "transitions": {"enter": "slide-up", "exit": "fade"},
            },
            {
                "id": "step-4",
                "type": "challenge",
                "duration_s": 40,
                "challenge": {
                    "instruction": f"Now it's your turn! Create a drawing that shows {title.lower()}.",
                    "hints": [
                        f"Think about what makes {title.lower()} special",
                        "Start simple — you can always add more detail",
                    ],
                    "success_criteria": "Submit any drawing to continue",
                    "input_mode": "language",
                },
                "bot_emotion": "encouraging",
                "transitions": {"enter": "scale", "exit": "fade"},
            },
            {
                "id": "step-5",
                "type": "celebrate",
                "duration_s": 15,
                "narration": {
                    "text": f"Amazing work! You've taken your first step into {title.lower()}. Keep exploring!",
                    "voice_style": "energetic",
                },
                "bot_emotion": "celebrating",
                "transitions": {"enter": "scale", "exit": "fade"},
            },
        ],
    }


lesson_service = LessonService()
