from __future__ import annotations

import base64
import io
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from app.services.state_manager import state_manager

PREVIEW_PATH = Path('/tmp/sketchbot-overlay-preview.png')
MARKER_PREVIEW_PATH = Path('/tmp/sketchbot-marker-preview.png')
ANNOTATED_FRAME_PATH = Path('/tmp/sketchbot-annotated-frame.jpg')


class OverlayPreviewService:
    def render_preview(self) -> bytes | None:
        state = state_manager.state
        border = state.camera.canvas_border
        if not border.detected or len(border.corners) != 4:
            return None

        source = self._load_overlay_source()
        if source is None:
            return None

        output = self._warp_to_canvas(source, border.corners)
        if output is None:
            return None
        PREVIEW_PATH.write_bytes(output)
        return output

    def latest_preview(self) -> bytes | None:
        if PREVIEW_PATH.exists():
            return PREVIEW_PATH.read_bytes()
        return None

    def render_marker_preview(self) -> bytes | None:
        state = state_manager.state
        frame_w = max(1, state.camera.frame_width)
        frame_h = max(1, state.camera.frame_height)
        output = np.zeros((frame_h, frame_w, 4), dtype=np.uint8)
        output, has_content = self._draw_marker_overlay(output)
        if not has_content:
          return None

        success, encoded = cv2.imencode('.png', output)
        if not success:
            return None
        payload = encoded.tobytes()
        MARKER_PREVIEW_PATH.write_bytes(payload)
        return payload

    def latest_marker_preview(self) -> bytes | None:
        if MARKER_PREVIEW_PATH.exists():
            return MARKER_PREVIEW_PATH.read_bytes()
        return None

    def render_annotated_frame(self) -> bytes | None:
        try:
            from app.services.camera_service import camera_service
        except Exception:
            return None

        payload = camera_service.get_latest_frame()
        if not payload:
            return None

        frame = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return None

        frame_rgba = cv2.cvtColor(frame, cv2.COLOR_BGR2BGRA)
        frame_rgba, has_markers = self._draw_marker_overlay(frame_rgba)
        if not has_markers:
            return payload

        frame_bgr = cv2.cvtColor(frame_rgba, cv2.COLOR_BGRA2BGR)
        success, encoded = cv2.imencode('.jpg', frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        if not success:
            return payload
        annotated = encoded.tobytes()
        ANNOTATED_FRAME_PATH.write_bytes(annotated)
        return annotated

    def latest_annotated_frame(self) -> bytes | None:
        if ANNOTATED_FRAME_PATH.exists():
            return ANNOTATED_FRAME_PATH.read_bytes()
        return None

    def _load_overlay_source(self) -> np.ndarray | None:
        overlay = state_manager.state.overlay
        if overlay.image_data_url:
            _, encoded = overlay.image_data_url.split(',', 1)
            data = base64.b64decode(encoded)
            image = Image.open(io.BytesIO(data)).convert('RGBA')
            return np.array(image)
        if overlay.svg_path:
            svg_bytes = overlay.svg_path.encode('utf-8')
            try:
                import cairosvg  # type: ignore
            except Exception:
                return None
            png_bytes = cairosvg.svg2png(bytestring=svg_bytes, output_width=1024, output_height=1024)
            image = Image.open(io.BytesIO(png_bytes)).convert('RGBA')
            return np.array(image)
        return None

    def _warp_to_canvas(self, source_rgba: np.ndarray, corners) -> bytes | None:
        frame_w = max(1, state_manager.state.camera.frame_width)
        frame_h = max(1, state_manager.state.camera.frame_height)
        src_h, src_w = source_rgba.shape[:2]

        dst_quad = np.array([[corner.x * frame_w, corner.y * frame_h] for corner in corners], dtype=np.float32)
        src_rect = np.array([[0, 0], [src_w - 1, 0], [src_w - 1, src_h - 1], [0, src_h - 1]], dtype=np.float32)
        matrix = cv2.getPerspectiveTransform(src_rect, dst_quad)
        warped = cv2.warpPerspective(
            source_rgba,
            matrix,
            (frame_w, frame_h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_TRANSPARENT,
        )
        success, encoded = cv2.imencode('.png', warped)
        if not success:
            return None
        return encoded.tobytes()

    def _draw_marker_overlay(self, image_rgba: np.ndarray) -> tuple[np.ndarray, bool]:
        state = state_manager.state
        frame_h, frame_w = image_rgba.shape[:2]
        has_content = False
        tag_color = (255, 224, 123, 255)
        border_color = (140, 79, 255, 255)
        label_bg = (25, 14, 6, 220)

        for detection in state.camera.april_tag_detections:
            if len(detection.corners) < 4:
                continue

            points = np.array(
                [[int(corner.x * frame_w), int(corner.y * frame_h)] for corner in detection.corners],
                dtype=np.int32,
            )
            cv2.polylines(image_rgba, [points], True, tag_color, 3, cv2.LINE_AA)

            min_x = int(points[:, 0].min())
            min_y = int(points[:, 1].min())
            label = f'Tag {detection.tag_id}'
            (text_w, text_h), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            label_top = max(4, min_y - text_h - baseline - 8)
            label_left = max(4, min_x)
            cv2.rectangle(
                image_rgba,
                (label_left - 4, label_top - 4),
                (label_left + text_w + 4, label_top + text_h + baseline + 4),
                label_bg,
                cv2.FILLED,
            )
            cv2.putText(
                image_rgba,
                label,
                (label_left, label_top + text_h),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (255, 247, 223, 255),
                1,
                cv2.LINE_AA,
            )
            has_content = True

        border = state.camera.canvas_border
        if border.detected and len(border.corners) >= 4:
            points = np.array(
                [[int(corner.x * frame_w), int(corner.y * frame_h)] for corner in border.corners],
                dtype=np.int32,
            )
            cv2.polylines(image_rgba, [points], True, border_color, 2, cv2.LINE_AA)
            for point in points:
                cv2.circle(image_rgba, tuple(point), 6, border_color, cv2.FILLED, cv2.LINE_AA)
                cv2.circle(image_rgba, tuple(point), 8, (255, 255, 255, 220), 1, cv2.LINE_AA)
            has_content = True

        return image_rgba, has_content


overlay_preview_service = OverlayPreviewService()
