"""
Student-facing SketchBot Python SDK.

This module powers Code mode. It exposes a tiny drawing-focused API that is safe
to inject into a restricted execution environment, while also making it easy to
convert student code into SVG previews and robot-friendly paths.
"""

from __future__ import annotations

import importlib
import math
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Iterable, Sequence

CANVAS_W = 297.0
CANVAS_H = 210.0
ALLOWED_IMPORTS = {"math", "numpy"}


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _safe_import(name: str, bot: "SketchBotRecorder", *args, **kwargs):
    if name == "sketchbot":
        return SimpleNamespace(
            draw_path=bot.draw_path,
            move_to=bot.move_to,
            move_relative=bot.move_relative,
            line_to=bot.line_to,
            pen_up=bot.pen_up,
            pen_down=bot.pen_down,
            set_speed=bot.set_speed,
            plot=bot.plot,
            polygon=bot.polygon,
            clear=bot.clear,
        )
    if name in ALLOWED_IMPORTS:
        return importlib.import_module(name)
    raise ImportError(
        f"Import of '{name}' is not allowed in SketchBot code mode. "
        "Allowed modules: math, numpy"
    )


@dataclass
class SketchBotRecorder:
    _paths: list[list[tuple[float, float]]] = field(default_factory=list)
    _current_path: list[tuple[float, float]] = field(default_factory=list)
    _current_pos: tuple[float, float] = (0.0, 0.0)
    _pen_is_down: bool = True
    _speed: str = "normal"

    def _normalize_point(self, x: float, y: float) -> tuple[float, float]:
        return (_clamp(float(x), 0.0, CANVAS_W), _clamp(float(y), 0.0, CANVAS_H))

    def _flush_current_path(self) -> None:
        if len(self._current_path) >= 2:
            self._paths.append(self._current_path.copy())
        self._current_path = []

    def draw_path(self, points: Sequence[tuple[float, float]]) -> None:
        normalized = [self._normalize_point(x, y) for x, y in points]
        if len(normalized) < 2:
            return
        self._flush_current_path()
        self._paths.append(normalized)
        self._current_pos = normalized[-1]

    def move_to(self, x: float, y: float) -> None:
        next_pos = self._normalize_point(x, y)
        self._current_pos = next_pos
        if self._pen_is_down:
            if not self._current_path:
                self._current_path.append(next_pos)
            else:
                self._current_path.append(next_pos)
        else:
            self._flush_current_path()

    def move_relative(self, dx: float, dy: float) -> None:
        self.move_to(self._current_pos[0] + float(dx), self._current_pos[1] + float(dy))

    def line_to(self, x: float, y: float) -> None:
        next_pos = self._normalize_point(x, y)
        if not self._current_path:
            self._current_path = [self._current_pos, next_pos]
        else:
            self._current_path.append(next_pos)
        self._current_pos = next_pos

    def pen_up(self) -> None:
        self._pen_is_down = False
        self._flush_current_path()

    def pen_down(self) -> None:
        self._pen_is_down = True

    def set_speed(self, speed: str) -> None:
        self._speed = speed

    def plot(
        self,
        fn: object,
        t_range: tuple[float, float] = (0, 2 * math.pi),
        steps: int = 300,
        scale: float = 80.0,
        center: tuple[float, float] = (CANVAS_W / 2, CANVAS_H / 2),
    ) -> None:
        t_start, t_end = t_range
        points: list[tuple[float, float]] = []
        for index in range(steps + 1):
            t = t_start + (t_end - t_start) * index / steps
            result = fn(t)  # type: ignore[operator]
            if isinstance(result, (list, tuple)) and len(result) == 2:
                rx, ry = float(result[0]), float(result[1])
                points.append((center[0] + rx * scale, center[1] + ry * scale))
        self.draw_path(points)

    def polygon(self, center_x: float, center_y: float, radius: float, sides: int, rotation_deg: float = 0) -> None:
        if sides < 3:
            raise ValueError("A polygon needs at least 3 sides.")
        points = []
        for index in range(sides + 1):
            angle = math.radians(rotation_deg) + (index / sides) * 2 * math.pi
            points.append(
                (
                    center_x + radius * math.cos(angle),
                    center_y + radius * math.sin(angle),
                )
            )
        self.draw_path(points)

    def clear(self) -> None:
        self._paths = []
        self._current_path = []
        self._current_pos = (0.0, 0.0)
        self._pen_is_down = True

    def current_position(self) -> tuple[float, float]:
        return self._current_pos

    def path_count(self) -> int:
        return len(self._paths) + (1 if len(self._current_path) >= 2 else 0)

    def iter_paths(self) -> Iterable[list[tuple[float, float]]]:
        for path in self._paths:
            yield path
        if len(self._current_path) >= 2:
            yield self._current_path

    def to_svg(self) -> str:
        path_elements: list[str] = []
        for path in self.iter_paths():
            svg_points = [(x, CANVAS_H - y) for x, y in path]
            d = f"M {svg_points[0][0]:.2f} {svg_points[0][1]:.2f}"
            for x, y in svg_points[1:]:
                d += f" L {x:.2f} {y:.2f}"
            path_elements.append(
                f'<path d="{d}" fill="none" stroke="black" stroke-width="1.5" '
                'stroke-linecap="round" stroke-linejoin="round"/>'
            )

        paths_svg = "\n  ".join(path_elements)
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS_W} {CANVAS_H}" '
            f'width="{CANVAS_W}" height="{CANVAS_H}">\n'
            f'  <rect width="{CANVAS_W}" height="{CANVAS_H}" fill="white"/>\n'
            f'  {paths_svg}\n'
            "</svg>"
        )


def make_sandbox() -> tuple[dict[str, object], SketchBotRecorder]:
    bot = SketchBotRecorder()
    safe_globals: dict[str, object] = {
        "__builtins__": {
            "print": print,
            "range": range,
            "len": len,
            "list": list,
            "tuple": tuple,
            "int": int,
            "float": float,
            "str": str,
            "bool": bool,
            "abs": abs,
            "min": min,
            "max": max,
            "round": round,
            "zip": zip,
            "enumerate": enumerate,
            "sum": sum,
            "map": map,
            "filter": filter,
            "sorted": sorted,
            "reversed": reversed,
            "isinstance": isinstance,
            "type": type,
            "ValueError": ValueError,
            "TypeError": TypeError,
            "IndexError": IndexError,
            "KeyError": KeyError,
            "StopIteration": StopIteration,
            "__import__": lambda name, *args, **kwargs: _safe_import(name, bot, *args, **kwargs),
        },
        "__name__": "__student__",
        "sketchbot": bot,
    }
    return safe_globals, bot
