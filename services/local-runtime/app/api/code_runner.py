from __future__ import annotations

import ast
import multiprocessing
import queue
import textwrap
import traceback
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.lib.sketchbot_sdk import make_sandbox
from app.services.overlay_service import overlay_service
from app.services.state_manager import state_manager
from app.services.task_library import task_library

router = APIRouter(prefix="/api/code-runner", tags=["code-runner"])

_EXECUTION_TIMEOUT_SECONDS = 5
_ALLOWED_IMPORTS = {"math", "numpy"}
_BLOCKED_CALLS = {
    "breakpoint",
    "compile",
    "delattr",
    "dir",
    "eval",
    "exec",
    "getattr",
    "globals",
    "help",
    "input",
    "locals",
    "open",
    "setattr",
    "vars",
}
_BLOCKED_ATTRIBUTES = {
    "chmod",
    "exec",
    "fork",
    "listdir",
    "makedirs",
    "mkdir",
    "open",
    "popen",
    "read",
    "remove",
    "rename",
    "replace",
    "rmdir",
    "system",
    "unlink",
    "walk",
    "write",
}


class RunRequest(BaseModel):
    code: str
    concept_id: str | None = None


class RunResponse(BaseModel):
    ok: bool
    message: str
    svg: str | None = None
    path_count: int = 0
    task_name: str | None = None


class _SecurityVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.errors: list[str] = []

    def visit_Import(self, node: ast.Import) -> Any:
        for alias in node.names:
            if alias.name == "sketchbot":
                continue
            if alias.name not in _ALLOWED_IMPORTS:
                self.errors.append(f"Only math, numpy, and sketchbot imports are allowed. Found '{alias.name}'.")
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> Any:
        module = node.module or ""
        if module not in _ALLOWED_IMPORTS:
            self.errors.append(f"Import from '{module}' is not allowed in Code mode.")
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> Any:
        if node.attr.startswith("__") or node.attr in _BLOCKED_ATTRIBUTES:
            self.errors.append(f"Attribute '{node.attr}' is not allowed in Code mode.")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> Any:
        if isinstance(node.func, ast.Name) and node.func.id in _BLOCKED_CALLS:
            self.errors.append(f"Call to '{node.func.id}' is not allowed in Code mode.")
        if isinstance(node.func, ast.Attribute) and node.func.attr in _BLOCKED_ATTRIBUTES:
            self.errors.append(f"Call to '{node.func.attr}' is not allowed in Code mode.")
        self.generic_visit(node)


def _validate_student_code(code: str) -> list[str]:
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return [f"Syntax error on line {exc.lineno}: {exc.msg}"]

    visitor = _SecurityVisitor()
    visitor.visit(tree)
    return visitor.errors


def _execute_student_code(code: str, result_queue: multiprocessing.Queue[dict[str, Any]]) -> None:
    safe_globals, bot = make_sandbox()

    try:
        exec(textwrap.dedent(code), safe_globals)  # noqa: S102
        svg = bot.to_svg()
        path_count = bot.path_count()
        result_queue.put(
            {
                "ok": True,
                "svg": svg,
                "path_count": path_count,
            }
        )
    except Exception:
        result_queue.put(
            {
                "ok": False,
                "message": "\n".join(traceback.format_exc().splitlines()[-4:]),
            }
        )


def _publish_code_result(*, svg: str, path_count: int, concept_id: str | None) -> str:
    job_name = f"{concept_id or 'code'} sketch"
    task = task_library.create_task(
        name=job_name,
        source_type="code",
        prompt=concept_id or "student code",
        svg_content=svg,
        path_count=path_count,
    )

    state = state_manager.state
    state.active_job.id = task["id"]
    state.active_job.name = task["name"]
    state.active_job.status = "draft"
    state.active_job.source_type = "code"
    state.active_job.path_count = path_count
    state.active_job.prompt = concept_id
    state.workflow_state = "draft_ready"

    overlay_service.set_path_label(task["name"])
    overlay_service.set_overlay_asset(
        svg_path=svg,
        image_data_url=None,
        source_name=task["name"],
        source_kind="code",
    )
    state_manager.add_event(f"Code sketch drafted: {task['name']}")
    return task["name"]


@router.post("/run", response_model=RunResponse)
def run_code(req: RunRequest) -> RunResponse:
    code = req.code.strip()
    if not code:
        return RunResponse(ok=False, message="No code to run.")

    errors = _validate_student_code(code)
    if errors:
        return RunResponse(ok=False, message=errors[0])

    ctx = multiprocessing.get_context("spawn")
    result_queue: multiprocessing.Queue[dict[str, Any]] = ctx.Queue()
    process = ctx.Process(target=_execute_student_code, args=(code, result_queue))
    process.start()
    process.join(_EXECUTION_TIMEOUT_SECONDS)

    if process.is_alive():
        process.terminate()
        process.join()
        return RunResponse(ok=False, message="Code execution timed out (5s limit).")

    try:
        payload = result_queue.get(timeout=0.2)
    except queue.Empty:
        return RunResponse(ok=False, message="Code runner exited without producing a result.")
    if not payload.get("ok"):
        return RunResponse(ok=False, message=payload.get("message", "Unknown code runner error."))

    svg = payload.get("svg")
    path_count = int(payload.get("path_count", 0))
    if not svg or path_count == 0:
        return RunResponse(
            ok=True,
            message=(
                "Code ran successfully but no drawing was produced. "
                "Use sketchbot.draw_path([(x1, y1), (x2, y2), ...]) or sketchbot.plot(...) to draw something."
            ),
            svg=None,
            path_count=0,
        )

    task_name = _publish_code_result(svg=svg, path_count=path_count, concept_id=req.concept_id)
    return RunResponse(
        ok=True,
        message=f"Success! Drew {path_count} path{'s' if path_count != 1 else ''}.",
        svg=svg,
        path_count=path_count,
        task_name=task_name,
    )


@router.get("/examples")
def list_examples() -> dict[str, list[dict[str, str]]]:
    return {
        "examples": [
            {"name": "Circle", "concept": "Trigonometry"},
            {"name": "Spiral", "concept": "Kinematics"},
            {"name": "Grid", "concept": "Coordinates"},
        ]
    }
