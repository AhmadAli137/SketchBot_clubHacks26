from __future__ import annotations

import math
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.lib.sketchbot_sdk import CANVAS_H, CANVAS_W, SketchBotRecorder
from app.services.overlay_service import overlay_service
from app.services.state_manager import state_manager
from app.services.task_library import task_library

router = APIRouter(prefix="/api/block-runner", tags=["block-runner"])

BlockType = Literal[
    "move_to",
    "move_relative",
    "draw_shape",
    "pen_up",
    "pen_down",
    "repeat",
    "set_speed",
    "draw_line",
]


class BlockInstruction(BaseModel):
    type: BlockType
    params: dict[str, Any] = Field(default_factory=dict)
    body: list["BlockInstruction"] = Field(default_factory=list)


class BlockProgram(BaseModel):
    blocks: list[BlockInstruction] = Field(default_factory=list)


BlockInstruction.model_rebuild()


class BlockRunRequest(BaseModel):
    concept_id: str | None = None
    program: BlockProgram


class BlockRunResponse(BaseModel):
    ok: bool
    message: str
    svg: str | None = None
    path_count: int = 0
    task_name: str | None = None


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, default: int = 1) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _draw_line(bot: SketchBotRecorder, params: dict[str, Any]) -> None:
    length = max(1.0, _to_float(params.get("length"), 80.0))
    direction = str(params.get("direction") or "right")
    x, y = bot.current_position()

    if direction == "up":
        bot.line_to(x, y + length)
    elif direction == "left":
        bot.line_to(x - length, y)
    elif direction == "down":
        bot.line_to(x, y - length)
    else:
        bot.line_to(x + length, y)


def _regular_polygon_points(
    center_x: float,
    center_y: float,
    radius: float,
    sides: int,
    rotation_deg: float = -90.0,
) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for index in range(sides + 1):
        angle = math.radians(rotation_deg + index * (360 / sides))
        points.append((center_x + radius * math.cos(angle), center_y + radius * math.sin(angle)))
    return points


def _star_points(center_x: float, center_y: float, radius: float) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    inner_radius = radius * 0.45
    for index in range(11):
        angle = math.radians(-90 + index * 36)
        current_radius = radius if index % 2 == 0 else inner_radius
        points.append((center_x + current_radius * math.cos(angle), center_y + current_radius * math.sin(angle)))
    return points


def _draw_shape(bot: SketchBotRecorder, params: dict[str, Any]) -> None:
    shape = str(params.get("shape") or "square")
    size = max(8.0, _to_float(params.get("size"), 60.0))
    center_x, center_y = bot.current_position()
    radius = size / 2

    if shape == "circle":
        points = _regular_polygon_points(center_x, center_y, radius, 36)
    elif shape == "triangle":
        points = _regular_polygon_points(center_x, center_y, radius, 3)
    elif shape == "hexagon":
        points = _regular_polygon_points(center_x, center_y, radius, 6)
    elif shape == "star":
        points = _star_points(center_x, center_y, radius)
    else:
        points = _regular_polygon_points(center_x, center_y, radius, 4, rotation_deg=45)

    bot.draw_path(points)


def _execute_block(bot: SketchBotRecorder, instruction: BlockInstruction) -> None:
    params = instruction.params
    if instruction.type == "move_to":
        bot.move_to(_to_float(params.get("x"), CANVAS_W / 2), _to_float(params.get("y"), CANVAS_H / 2))
    elif instruction.type == "move_relative":
        bot.move_relative(_to_float(params.get("dx"), 0.0), _to_float(params.get("dy"), 0.0))
    elif instruction.type == "draw_shape":
        _draw_shape(bot, params)
    elif instruction.type == "draw_line":
        _draw_line(bot, params)
    elif instruction.type == "pen_up":
        bot.pen_up()
    elif instruction.type == "pen_down":
        bot.pen_down()
    elif instruction.type == "set_speed":
        bot.set_speed(str(params.get("speed") or "normal"))
    elif instruction.type == "repeat":
        times = max(1, _to_int(params.get("times"), 1))
        for _ in range(times):
            for nested_instruction in instruction.body:
                _execute_block(bot, nested_instruction)


def _run_program(program: BlockProgram) -> tuple[str | None, int]:
    bot = SketchBotRecorder()
    for block in program.blocks:
        _execute_block(bot, block)

    return bot.to_svg(), bot.path_count()


def _publish_block_result(*, svg: str, path_count: int, concept_id: str | None) -> str:
    job_name = f"{concept_id or 'structural'} blocks"
    task = task_library.create_task(
        name=job_name,
        source_type="blocks",
        prompt=concept_id or "block program",
        svg_content=svg,
        path_count=path_count,
    )

    state = state_manager.state
    state.active_job.id = task["id"]
    state.active_job.name = task["name"]
    state.active_job.status = "draft"
    state.active_job.source_type = "blocks"
    state.active_job.path_count = path_count
    state.active_job.prompt = concept_id
    state.workflow_state = "draft_ready"

    overlay_service.set_path_label(task["name"])
    overlay_service.set_overlay_asset(
        svg_path=svg,
        image_data_url=None,
        source_name=task["name"],
        source_kind="blocks",
    )
    state_manager.add_event(f"Structural block sketch drafted: {task['name']}")
    return task["name"]


@router.post("/run", response_model=BlockRunResponse)
def run_block_program(req: BlockRunRequest) -> BlockRunResponse:
    if not req.program.blocks:
        return BlockRunResponse(ok=False, message="Add at least one block before running the program.")

    svg, path_count = _run_program(req.program)
    if not svg or path_count == 0:
        return BlockRunResponse(ok=False, message="The block program ran, but it did not produce a drawable path.")

    task_name = _publish_block_result(svg=svg, path_count=path_count, concept_id=req.concept_id)
    return BlockRunResponse(
        ok=True,
        message=f"Success! Structured program generated {path_count} path{'s' if path_count != 1 else ''}.",
        svg=svg,
        path_count=path_count,
        task_name=task_name,
    )
