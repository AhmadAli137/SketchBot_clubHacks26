from __future__ import annotations

import json
from pathlib import Path

from app.services.overlay_service import overlay_service
from app.services.prompt_generation_service import prompt_generation_service
from app.services.state_manager import state_manager
from app.services.task_library import task_library

_DEMO_PATH = Path(__file__).parents[2] / "data" / "demo_sequences.json"
_demos_cache: list[dict] | None = None


def _load_demos() -> list[dict]:
    global _demos_cache
    if _demos_cache is None:
        try:
            _demos_cache = json.loads(_DEMO_PATH.read_text(encoding="utf-8"))
        except Exception:
            _demos_cache = []
    return _demos_cache


def get_demo(demo_id: str) -> dict | None:
    for d in _load_demos():
        if d.get("id") == demo_id:
            return d
    return None


def list_demos() -> list[dict]:
    """Return a summary list of all available demos (no step details)."""
    return [
        {
            "id": d["id"],
            "concept_id": d.get("concept_id"),
            "title": d["title"],
            "description": d.get("description", ""),
            "estimated_seconds": d.get("estimated_seconds", 15),
            "step_count": len(d.get("steps", [])),
        }
        for d in _load_demos()
    ]


async def run_demo_step(demo_id: str, step_index: int) -> dict:
    """
    Execute a single step of a demo sequence.
    Generates the SVG for that step using the prompt generation service.

    Returns:
        {
            "step": int,
            "label": str,
            "svg": str,
            "tutor_narration": str,
            "is_last": bool,
        }
    """
    demo = get_demo(demo_id)
    if not demo:
        raise ValueError(f"Demo '{demo_id}' not found.")

    steps = demo.get("steps", [])
    if step_index >= len(steps):
        raise IndexError(f"Step {step_index} out of range for demo '{demo_id}' ({len(steps)} steps).")

    step = steps[step_index]
    prompt = step.get("prompt", "draw a simple shape")

    # Generate SVG synchronously (the underlying service is sync)
    svg = prompt_generation_service.generate_svg(prompt)

    job_name = f"{demo.get('title', demo_id)} - {step.get('label', f'Step {step_index + 1}')}"
    task = task_library.create_task(
        name=job_name,
        source_type="demo",
        prompt=prompt,
        svg_content=svg,
        path_count=max(1, prompt.count("draw")),
    )

    state = state_manager.state
    state.active_job.id = task["id"]
    state.active_job.name = task["name"]
    state.active_job.status = "draft"
    state.active_job.source_type = "demo"
    state.active_job.path_count = task["path_count"]
    state.active_job.prompt = prompt
    state.workflow_state = "draft_ready"
    overlay_service.set_path_label(task["name"])
    overlay_service.set_overlay_asset(
        svg_path=svg,
        image_data_url=None,
        source_name=task["name"],
        source_kind="demo",
    )
    state_manager.add_event(f"Demo step prepared: {task['name']}")

    return {
        "step": step.get("step", step_index + 1),
        "label": step.get("label", f"Step {step_index + 1}"),
        "svg": svg,
        "tutor_narration": step.get("tutor_narration", ""),
        "is_last": step_index >= len(steps) - 1,
        "task_name": task["name"],
    }


class DemoService:
    """
    Stateless service for looking up and executing demo sequences.
    The actual sequencing/pacing is handled by the API layer + frontend.
    """

    def list_demos(self) -> list[dict]:
        return list_demos()

    def get_demo(self, demo_id: str) -> dict | None:
        return get_demo(demo_id)

    async def run_step(self, demo_id: str, step_index: int) -> dict:
        return await run_demo_step(demo_id, step_index)


demo_service = DemoService()
