from __future__ import annotations

import math
import time
from typing import Iterable
from pathlib import Path

import cv2
import numpy as np

from app.models.state import AprilTagDetection, CanvasBorder, Point2D
from app.services.state_manager import state_manager

DEBUG_FRAME_PATH = Path('/tmp/sketchbot-apriltag-analysis.jpg')
DEBUG_NORMALIZED_PATH = Path('/tmp/sketchbot-apriltag-analysis-normalized.png')

class AprilTagService:
    def __init__(self) -> None:
        parameters = cv2.aruco.DetectorParameters()
        parameters.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
        parameters.adaptiveThreshWinSizeMin = 5
        parameters.adaptiveThreshWinSizeMax = 35
        parameters.adaptiveThreshWinSizeStep = 5
        parameters.minMarkerPerimeterRate = 0.015
        parameters.maxMarkerPerimeterRate = 6.0
        self._detectors = [
            ('tag36h11', cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36h11), parameters)),
            ('tag36h10', cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36h10), parameters)),
            ('tag25h9', cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_25h9), parameters)),
            ('tag16h5', cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_16h5), parameters)),
        ]
        self._last_canvas_border: CanvasBorder | None = None
        self._last_canvas_confidence: float = 0.0
        self._last_robot_heading_deg: float = 0.0
        self._last_seen_at: float | None = None
        self._hold_seconds = 1.0
        self._last_debug_summary: dict = {
            'status': 'idle',
            'last_updated_at': None,
            'frame_width': None,
            'frame_height': None,
            'detections': [],
            'family_attempts': [],
            'canvas_detected': False,
            'canvas_confidence': 0.0,
        }

    def update_from_frame(self, payload: bytes | None) -> None:
        state = state_manager.state
        if not payload:
            self._clear_detection_state()
            return

        try:
            DEBUG_FRAME_PATH.write_bytes(payload)
        except Exception:
            pass

        frame = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            self._clear_detection_state()
            return

        detections, family_attempts = self._detect_tags(frame)

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

        self._last_debug_summary = {
            'status': 'ok',
            'last_updated_at': time.time(),
            'frame_width': int(frame.shape[1]),
            'frame_height': int(frame.shape[0]),
            'detections': [
                {
                    'tag_id': detection.tag_id,
                    'family': detection.family,
                    'decision_margin': detection.decision_margin,
                }
                for detection in detections
            ],
            'family_attempts': family_attempts,
            'canvas_detected': state.canvas.detected,
            'canvas_confidence': state.canvas.confidence,
        }

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

            # ── Camera-derived bot position (x_mm, y_mm) ──────────────
            # Build a perspective transform from the four canvas corner
            # tags (pixel) to the canvas's known mm dimensions, then
            # apply it to the bot tag's centre pixel. Result: live
            # ground-truth x_mm / y_mm that the calibration wizard
            # (Cal.4) reads to measure actual travel without a ruler.
            #
            # Tag id convention:
            #   0 = top-left      → ( 0, 0 )
            #   1 = top-right     → ( W, 0 )
            #   2 = bottom-right  → ( W, H )
            #   3 = bottom-left   → ( 0, H )
            #
            # Falls through silently when fewer than 4 canvas tags are
            # visible — heading still updates so the wizard's rotate
            # step is still calibratable even on partial detections.
            if len(canvas_tags) == 4:
                try:
                    tag_by_id = {d.tag_id: d for d in canvas_tags}
                    src_pts = np.array([
                        [tag_by_id[0].center.x, tag_by_id[0].center.y],
                        [tag_by_id[1].center.x, tag_by_id[1].center.y],
                        [tag_by_id[2].center.x, tag_by_id[2].center.y],
                        [tag_by_id[3].center.x, tag_by_id[3].center.y],
                    ], dtype=np.float32)
                    w_mm = float(state.canvas.width_mm or 297.0)
                    h_mm = float(state.canvas.height_mm or 210.0)
                    dst_pts = np.array([
                        [0.0,   0.0],
                        [w_mm,  0.0],
                        [w_mm,  h_mm],
                        [0.0,   h_mm],
                    ], dtype=np.float32)
                    H = cv2.getPerspectiveTransform(src_pts, dst_pts)
                    bot_px = np.array([[[robot_tag.center.x, robot_tag.center.y]]], dtype=np.float32)
                    bot_mm = cv2.perspectiveTransform(bot_px, H)
                    raw_x = float(bot_mm[0, 0, 0])
                    raw_y = float(bot_mm[0, 0, 1])
                    # Same exponential smoothing as heading so motion
                    # commands followed by a pose read see a settled
                    # value rather than the latest noisy detection.
                    state.robot_pose.x_mm = state.robot_pose.x_mm * 0.5 + raw_x * 0.5
                    state.robot_pose.y_mm = state.robot_pose.y_mm * 0.5 + raw_y * 0.5
                except (cv2.error, KeyError, ValueError):
                    # Degenerate tag layout (collinear, mirrored). Skip
                    # this frame; next one will likely succeed.
                    pass

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
        self._last_debug_summary = {
            'status': 'waiting-for-frame',
            'last_updated_at': time.time(),
            'frame_width': None,
            'frame_height': None,
            'detections': [],
            'family_attempts': [],
            'canvas_detected': False,
            'canvas_confidence': 0.0,
        }
        state_manager._normalize_state()
        state_manager._refresh_operator_summary()

    def update_mock_detections(self) -> None:
        state = state_manager.state
        if state.camera.april_tag_detections:
            return

    def _detect_tags(self, frame: np.ndarray) -> tuple[list[AprilTagDetection], list[dict]]:
        grayscale = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        normalized = cv2.equalizeHist(grayscale)
        try:
            cv2.imwrite(str(DEBUG_NORMALIZED_PATH), normalized)
        except Exception:
            pass

        detections_by_key: dict[tuple[str, int], AprilTagDetection] = {}
        family_attempts: list[dict] = []
        for family, detector in self._detectors:
            corners, ids, rejected = detector.detectMarkers(normalized)
            ids_list = [] if ids is None else [int(marker_id) for marker_id in ids.flatten()]
            family_attempts.append(
                {
                    'family': family,
                    'count': len(ids_list),
                    'ids': ids_list,
                    'rejected_count': len(rejected) if rejected is not None else 0,
                }
            )
            for detection in self._convert_detections(corners, ids, frame.shape[1], frame.shape[0], family):
                key = (family, detection.tag_id)
                existing = detections_by_key.get(key)
                if existing is None or detection.decision_margin > existing.decision_margin:
                    detections_by_key[key] = detection

        return list(detections_by_key.values()), family_attempts

    def debug_snapshot(self) -> dict:
        return dict(self._last_debug_summary)

    def debug_frame(self) -> bytes | None:
        if DEBUG_FRAME_PATH.exists():
            return DEBUG_FRAME_PATH.read_bytes()
        return None

    def debug_normalized_frame(self) -> bytes | None:
        if DEBUG_NORMALIZED_PATH.exists():
            return DEBUG_NORMALIZED_PATH.read_bytes()
        return None

    def _order_canvas_corners(self, corners: list[Point2D]) -> list[Point2D]:
        pts = np.array([[corner.x, corner.y] for corner in corners], dtype=np.float32)
        sums = pts.sum(axis=1)
        diffs = pts[:, 0] - pts[:, 1]

        top_left = pts[np.argmin(sums)]
        bottom_right = pts[np.argmax(sums)]
        top_right = pts[np.argmax(diffs)]
        bottom_left = pts[np.argmin(diffs)]

        ordered = [top_left, top_right, bottom_right, bottom_left]
        return [Point2D(x=float(x), y=float(y)) for x, y in ordered]

    def _convert_detections(self, corners, ids, width: int, height: int, family: str) -> list[AprilTagDetection]:
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
                    family=family,
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

        required_detections = [by_id[tag_id] for tag_id in required]
        if min(len(detection.corners) for detection in required_detections) < 4:
            return CanvasBorder(detected=False)

        canvas_center = Point2D(
            x=sum(detection.center.x for detection in required_detections) / len(required_detections),
            y=sum(detection.center.y for detection in required_detections) / len(required_detections),
        )
        outer_corners = [
            max(
                detection.corners,
                key=lambda corner: (corner.x - canvas_center.x) ** 2 + (corner.y - canvas_center.y) ** 2,
            )
            for detection in required_detections
        ]

        border_corners = self._order_canvas_corners(outer_corners)
        return CanvasBorder(corners=border_corners, source_tag_ids=required, detected=True)


apriltag_service = AprilTagService()
