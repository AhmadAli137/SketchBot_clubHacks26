"""Backward-compatible shim for the student SketchBot SDK."""

from app.lib.sketchbot_sdk import CANVAS_H, CANVAS_W, SketchBotRecorder, make_sandbox

__all__ = ["CANVAS_H", "CANVAS_W", "SketchBotRecorder", "make_sandbox"]
