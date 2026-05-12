"""Persistent registry of per-tag heights above the canvas plane.

Used by the AprilTag service to compute parallax-correct robot poses:
the robot tag sits on top of the chassis, so its image-plane position
back-projects to a different (x_mm, y_mm) than the canvas-plane
homography would imply. Heights are stored on disk so a one-time
measurement survives restarts.

Defaults match the original hardcoded TAG_HEIGHTS_MM dict in
apriltag_service.py. Corner tags (0–3) lie on the paper; the bot tag
(4) defaults to 50 mm and should be tuned to the actual chassis mount
height via the calibration UI.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path

logger = logging.getLogger("sketchbot.tag_heights")

_DATA_PATH = (
    Path(os.environ.get("SKETCHBOT_DATA_DIR") or (Path(__file__).parents[2] / "data"))
    / "tag-heights.json"
)

DEFAULTS: dict[int, float] = {
    0: 0.0,   # canvas top-left
    1: 0.0,   # canvas top-right
    2: 0.0,   # canvas bottom-right
    3: 0.0,   # canvas bottom-left
    4: 50.0,  # bot tag — tune to chassis mount height
}


class TagHeightsStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._heights: dict[int, float] = dict(DEFAULTS)
        self._load()

    def _load(self) -> None:
        try:
            if _DATA_PATH.exists():
                raw = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    # JSON keys come back as strings; coerce to int.
                    parsed = {int(k): float(v) for k, v in raw.items()}
                    self._heights.update(parsed)
        except (ValueError, OSError) as exc:
            logger.warning("tag-heights.json unreadable; using defaults: %s", exc)

    def _save(self) -> None:
        try:
            _DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
            # JSON object keys are strings — serialise as such.
            payload = {str(k): v for k, v in self._heights.items()}
            _DATA_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        except OSError as exc:
            logger.warning("failed to persist tag-heights.json: %s", exc)

    def get(self, tag_id: int, default: float = 0.0) -> float:
        with self._lock:
            return self._heights.get(int(tag_id), default)

    def all(self) -> dict[int, float]:
        with self._lock:
            return dict(self._heights)

    def update(self, updates: dict[int, float]) -> dict[int, float]:
        with self._lock:
            for k, v in updates.items():
                self._heights[int(k)] = float(v)
            self._save()
            return dict(self._heights)


tag_heights_store = TagHeightsStore()
