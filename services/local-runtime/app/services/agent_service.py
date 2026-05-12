"""
AgentService — Claude tool-use loop that drives the SketchBot autonomously.

The agent receives a plain-language goal (e.g. "draw a 15 cm square") and
translates it into a sequence of low-level robot commands executed one-by-one
via the existing WebSocket connection.

Tool protocol
─────────────
Each tool call is sent to the robot as a WebSocket `command` message and the
agent waits for the `command_result` acknowledgement before proceeding.
This makes every action synchronous from the agent's perspective.

Streaming
─────────
`stream_run()` is an async generator that yields SSE-compatible JSON lines:
  {"type": "plan",      "text": "..."}       — agent narration / thinking
  {"type": "tool_call", "name": "...", "args": {...}}  — about to execute
  {"type": "tool_result", "ok": bool, "message": "..."}
  {"type": "done",      "summary": "..."}
  {"type": "error",     "message": "..."}
"""

from __future__ import annotations

import json
import logging
import os
from typing import AsyncIterator

import anthropic

from app.services.robot_ws_service import robot_ws_service
from app.services.state_manager import state_manager

logger = logging.getLogger("sketchbot.agent")

# ─── Tool definitions (sent to Claude) ────────────────────────────────────────

TOOLS: list[dict] = [
    {
        "name": "move_forward",
        "description": "Drive the robot forward by the given distance in millimetres. Positive mm = forward, negative = backward.",
        "input_schema": {
            "type": "object",
            "properties": {
                "mm":         {"type": "number", "description": "Distance in mm. Negative to reverse."},
                "speed_mm_s": {"type": "number", "description": "Speed in mm/s (default 60).", "default": 60},
            },
            "required": ["mm"],
        },
    },
    {
        "name": "rotate",
        "description": "Rotate the robot in place by the given angle. Positive = clockwise, negative = counter-clockwise.",
        "input_schema": {
            "type": "object",
            "properties": {
                "degrees":   {"type": "number", "description": "Degrees to rotate. Positive = CW."},
                "speed_dps": {"type": "number", "description": "Rotation speed in degrees/s (default 90).", "default": 90},
            },
            "required": ["degrees"],
        },
    },
    {
        "name": "pen_down",
        "description": "Lower the pen so the robot draws as it moves.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "pen_up",
        "description": "Lift the pen so the robot moves without drawing.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "go_to",
        "description": (
            "Move to an absolute (x, y) position on the canvas in millimetres. "
            "Requires the robot to be homed. (0, 0) is the home/reference corner."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "x_mm":       {"type": "number", "description": "Target X in mm from home."},
                "y_mm":       {"type": "number", "description": "Target Y in mm from home."},
                "speed_mm_s": {"type": "number", "description": "Travel speed in mm/s (default 60).", "default": 60},
            },
            "required": ["x_mm", "y_mm"],
        },
    },
    {
        "name": "home",
        "description": "Drive the robot to its home/reference position (uses AprilTag or limit switch). Always call this first if position is unknown.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "stop",
        "description": "Immediately stop all motion and hold position.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_state",
        "description": "Read the robot's current position, heading, pen state, and motion status. Call this to check where the robot is before planning relative moves.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "wait_idle",
        "description": "Wait until the robot reports it is no longer moving (useful after go_to if you want to confirm arrival before the next step).",
        "input_schema": {
            "type": "object",
            "properties": {
                "timeout_s": {"type": "number", "description": "Max seconds to wait (default 30).", "default": 30},
            },
            "required": [],
        },
    },
]

# ─── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an autonomous robot controller for SketchBot — a differential-drive wheeled robot that draws on paper.

Your job: receive a goal in plain English and execute it precisely using the available tools.

Robot facts:
- Differential-drive: two powered wheels + a caster. Turning is done in-place via `rotate`.
- Canvas: ~420 mm × 297 mm (A3). Origin (0, 0) is the home corner (bottom-left when facing the canvas).
- Pen: servo-actuated. Always call pen_up before moving to a new start position.
- Speed: default 60 mm/s travel, 90 deg/s rotation. Reduce for accuracy.
- AprilTag-based localization: after `home`, absolute go_to commands are accurate to ~2 mm.

Rules:
1. Always start with `home` unless the goal explicitly says the robot is already positioned.
2. Always `pen_up` before any non-drawing travel move.
3. Think through the full geometry before issuing the first move — comment your plan as text.
4. After the final move, call `pen_up` and return a short summary of what was drawn.
5. Use `get_state` if you need to confirm position mid-task.
6. If a command returns ok=false, stop and report the error — don't continue blindly.

Coordinate convention: X = right, Y = up (away from the home corner). Angles: 0° = facing +X, 90° = facing +Y."""


# ─── Execute a single tool call on the robot ──────────────────────────────────

async def _execute_tool(name: str, args: dict) -> dict:
    """Execute one tool, wait for result, return {ok, message}."""

    # get_state is local — no WS needed
    if name == "get_state":
        state = state_manager.state
        pose = state.robot_pose
        return {
            "ok": True,
            "message": "ok",
            "state": {
                "x_mm":        getattr(pose, "x_mm", 0),
                "y_mm":        getattr(pose, "y_mm", 0),
                "heading_deg": getattr(pose, "heading_deg", 0),
                "pen_down":    getattr(pose, "pen_down", False),
                "robot_status": state.robot_status,
                "connected":   state.robot_connected,
            },
        }

    # wait_idle polls state
    if name == "wait_idle":
        import asyncio
        timeout = float(args.get("timeout_s", 30))
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            if state_manager.state.robot_status in ("ready", "idle"):
                return {"ok": True, "message": "robot idle"}
            await asyncio.sleep(0.2)
        return {"ok": False, "message": "timed out waiting for idle"}

    # All other tools → send as WS command
    if not state_manager.state.robot_connected:
        return {"ok": False, "message": "robot not connected — cannot execute command"}

    # Map tool name → command name (same in our protocol)
    cmd_args = {k: v for k, v in args.items() if k not in ("speed_mm_s", "speed_dps") or True}
    cmd_id = await robot_ws_service.send_command(name, cmd_args)
    if not cmd_id:
        return {"ok": False, "message": "WebSocket not connected"}

    result = await robot_ws_service.wait_for_command_result(
        cmd_id, timeout=args.get("timeout_s", 30),
    )
    return result


# ─── Main streaming agent loop ─────────────────────────────────────────────────

class AgentService:
    def __init__(self) -> None:
        self._running = False

    def is_running(self) -> bool:
        return self._running

    def abort(self) -> None:
        self._running = False

    async def stream_run(self, goal: str) -> AsyncIterator[str]:
        """Yield JSON SSE lines while autonomously executing a goal."""
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            yield _sse({"type": "error", "message": "ANTHROPIC_API_KEY not set"})
            return

        self._running = True
        client = anthropic.AsyncAnthropic(api_key=api_key)

        messages: list[dict] = [{"role": "user", "content": goal}]
        yield _sse({"type": "plan", "text": f"Goal received: {goal}"})

        try:
            while self._running:
                response = await client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=4096,
                    system=SYSTEM_PROMPT,
                    tools=TOOLS,
                    messages=messages,
                )

                # Collect text blocks as narration
                for block in response.content:
                    if block.type == "text" and block.text.strip():
                        yield _sse({"type": "plan", "text": block.text})

                # If no tool use, Claude is done
                if response.stop_reason == "end_turn":
                    summary = next(
                        (b.text for b in response.content if b.type == "text"),
                        "Task complete.",
                    )
                    yield _sse({"type": "done", "summary": summary})
                    break

                if response.stop_reason != "tool_use":
                    yield _sse({"type": "error", "message": f"Unexpected stop reason: {response.stop_reason}"})
                    break

                # Execute tool calls
                tool_results = []
                for block in response.content:
                    if block.type != "tool_use":
                        continue

                    if not self._running:
                        yield _sse({"type": "error", "message": "Aborted by user"})
                        return

                    tool_name = block.name
                    tool_args = block.input
                    yield _sse({"type": "tool_call", "name": tool_name, "args": tool_args})

                    try:
                        result = await _execute_tool(tool_name, tool_args)
                    except Exception as exc:  # noqa: BLE001
                        result = {"ok": False, "message": str(exc)}

                    yield _sse({"type": "tool_result", "tool": tool_name, "ok": result.get("ok", False), "message": result.get("message", "")})
                    logger.info("agent tool %s → ok=%s msg=%s", tool_name, result.get("ok"), result.get("message"))

                    # If a command failed, abort
                    if not result.get("ok", False):
                        yield _sse({"type": "error", "message": f"Command '{tool_name}' failed: {result.get('message')}"})
                        return

                    # Package result for next Claude turn
                    content: list[dict] | str
                    if tool_name == "get_state" and "state" in result:
                        content = json.dumps(result["state"])
                    else:
                        content = result.get("message") or "ok"

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": content,
                    })

                # Append assistant turn + tool results for next iteration
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})

        except anthropic.APIError as exc:
            yield _sse({"type": "error", "message": f"Anthropic API error: {exc}"})
        finally:
            self._running = False


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


agent_service = AgentService()
