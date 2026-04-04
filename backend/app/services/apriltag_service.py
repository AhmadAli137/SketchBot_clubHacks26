from __future__ import annotations

import math
import time
from typing import Iterable

import cv2
import numpy as np

from app.models.state import AprilTagDetection, CanvasBorder, Point2D
from app.services.state_manager import state_manager


class AprilTagService:
    def __init__(self) -> None:
        self._dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36h11)
        self._detector = cv2.aruco.ArucoDetector(self._dictionary, cv2.aruco.DetectorParameters())
        self._last_canvas_border: CanvasBorder | None = None
        self._last_canvas_confidence: float = 0.0
        self._last_robot_heading_deg: float = 0.0
        self._last_seen_at: float | None = None
        self._hold_seconds = 1.0

    def update_from_frame(self, payload: bytes | None) -> None:
        state = state_manager.state
        if not payload:
            self._clear_detection_state()
            return

        frame = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            self._clear_detection_state()
            return

        corners, ids, rejected = self._detector.detectMarkers(frame)
        detections = self._convert_detections(corners, ids, frame.shape[1], frame.shape[0])

        state.camera.april_tag_detections = detections
        canvas_tags = [d for d in detections if d.tag_id in {0, 1, 2, 3}]
        computed_border = self._build_canvas_border(canvas_tags)
        computed_confidence = min(1.0, len(canvas_tags) / 4.0) if canvas_tags else 0.0

        now = time.time()
        if computed_border.detected:
            self._last_canvas_border = computed_border
            self._last_canvas_confidence = computed_confidence
            self._last_seen_at = now
            state.camera.canvas_border = computed_border
            state.canvas.detected = True
            state.canvas.confidence = computed_confidence
            state.localization_confidence = computed_confidence
        elif self._last_canvas_border is not None and self._last_seen_at is not None and (now - self._last_seen_at) <= self._hold_seconds:
            state.camera.canvas_border = self._last_canvas_border
            state.canvas.detected = True
            state.canvas.confidence = max(0.0, self._last_canvas_confidence * 0.75)
            state.localization_confidence = state.canvas.confidence
        else:
            state.camera.canvas_border = CanvasBorder(detected=False)
            state.canvas.detected = False
            state.canvas.confidence = 0.0
            state.localization_confidence = 0.0

        canvas_angle_deg = None
        if len(canvas_tags) >= 2:
            top_left = next((d for d in canvas_tags if d.tag_id == 0), None)
            top_right = next((d for d in canvas_tags if d.tag_id == 1), None)
            if top_left is not None and top_right is not None:
                canvas_angle_deg = math.degrees(
                    math.atan2(
                        top_right.center.y - top_left.center.y,
                        top_right.center.x - top_left.center.x,
                    )
                )

        robot_tag = next((d for d in detections if d.tag_id == 4), None)
        if robot_tag and len(robot_tag.corners) >= 2:
            p0 = robot_tag.corners[0]
            p1 = robot_tag.corners[1]
            raw_angle_deg = math.degrees(math.atan2(p1.y - p0.y, p1.x - p0.x))
            corrected_angle_deg = raw_angle_deg + 180.0
            if canvas_angle_deg is not None:
                corrected_angle_deg -= canvas_angle_deg
            normalized_angle_deg = ((corrected_angle_deg + 180.0) % 360.0) - 180.0

            previous_heading = state.robot_pose.heading_deg
            candidates = [
                normalized_angle_deg,
                ((normalized_angle_deg + 180.0 + 180.0) % 360.0) - 180.0,
            ]
            best_heading = min(
                candidates,
                key=lambda candidate: abs((((candidate - previous_heading) + 180.0) % 360.0) - 180.0),
            )
            smoothed_heading = previous_heading * 0.7 + best_heading * 0.3
            state.robot_pose.heading_deg = smoothed_heading
            self._last_robot_heading_deg = smoothed_heading

        state_manager._normalize_state()
        state_manager._refresh_operator_summary()

    def _clear_detection_state(self) -> None:
        state = state_manager.state
        state.camera.april_tag_detections = []
        state.camera.canvas_border = CanvasBorder(detected=False)
        state.canvas.detected = False
        state.canvas.confidence = 0.0
        state.localization_confidence = 0.0
        state.robot_pose.heading_deg = 0.0
        state_manager._normalize_state()
        state_manager._refresh_operator_summary()

    def update_mock_detections(self) -> None:
        state = state_manager.state
        if state.camera.april_tag_detections:
            return

    def _convert_detections(self, corners, ids, width: int, height: int) -> list[AprilTagDetection]:
        if ids is None or len(ids) == 0:
            return []

        detections: list[AprilTagDetection] = []
        for marker_corners, marker_id in zip(corners, ids.flatten(), strict=False):
            pts = marker_corners.reshape(-1, 2)
            corner_points = [Point2D(x=float(x / width), y=float(y / height)) for x, y in pts]
            center = Point2D(
                x=float(np.mean(pts[:, 0]) / width),
                y=float(np.mean(pts[:, 1]) / height),
            )
            perimeter = cv2.arcLength(pts.astype(np.float32), True)
            detections.append(
                AprilTagDetection(
                    tag_id=int(marker_id),
                    center=center,
                    corners=corner_points,
                    decision_margin=float(perimeter),
                )
            )
        return detections

    def _build_canvas_border(self, detections: Iterable[AprilTagDetection]) -> CanvasBorder:
        by_id = {d.tag_id: d for d in detections}
        required = [0, 1, 2, 3]
        if any(tag_id not in by_id for tag_id in required):
            return CanvasBorder(detected=False)

        border_corners = [
            by_id[0].center,
            by_id[1].center,
            by_id[2].center,
            by_id[3].center,
        ]
        return CanvasBorder(corners=border_corners, source_tag_ids=required, detected=True)


apriltag_service = AprilTagService()
