from __future__ import annotations

import base64
import io
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from app.services.state_manager import state_manager

PREVIEW_PATH = Path('/tmp/sketchbot-overlay-preview.png')


class OverlayPreviewService:
    def render_preview(self) -> bytes | None:
        state = state_manager.state
        border = state.camera.canvas_border
        if not border.detected or len(border.corners) != 4:
            return None

        frame_bytes = state.camera.latest_frame_url
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

    def _load_overlay_source(self) -> np.ndarray | None:
        overlay = state_manager.state.overlay
        if overlay.image_data_url:
            header, encoded = overlay.image_data_url.split(',', 1)
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
        frame_w = 1280
        frame_h = 720
        src_h, src_w = source_rgba.shape[:2]

        top_w = math.dist((corners[0].x, corners[0].y), (corners[1].x, corners[1].y))
        bottom_w = math.dist((corners[3].x, corners[3].y), (corners[2].x, corners[2].y))
        left_h = math.dist((corners[0].x, corners[0].y), (corners[3].x, corners[3].y))
        right_h = math.dist((corners[1].x, corners[1].y), (corners[2].x, corners[2].y))

        quad_w = max(1e-6, (top_w + bottom_w) / 2.0)
        quad_h = max(1e-6, (left_h + right_h) / 2.0)
        quad_aspect = quad_w / quad_h
        src_aspect = src_w / max(1, src_h)

        if src_aspect > quad_aspect:
            fit_w = 1.0
            fit_h = quad_aspect / src_aspect
        else:
            fit_h = 1.0
            fit_w = src_aspect / quad_aspect

        inset_x = (1.0 - fit_w) / 2.0
        inset_y = (1.0 - fit_h) / 2.0

        dst_quad = np.array([[corner.x * frame_w, corner.y * frame_h] for corner in corners], dtype=np.float32)
        src_rect = np.array([[0, 0], [src_w - 1, 0], [src_w - 1, src_h - 1], [0, src_h - 1]], dtype=np.float32)

        norm_fit = np.array([
            [inset_x, inset_y],
            [inset_x + fit_w, inset_y],
            [inset_x + fit_w, inset_y + fit_h],
            [inset_x, inset_y + fit_h],
        ], dtype=np.float32)

        fit_quad = self._map_normalized_quad_to_quad(norm_fit, dst_quad)
        matrix = cv2.getPerspectiveTransform(src_rect, fit_quad)
        warped = cv2.warpPerspective(source_rgba, matrix, (frame_w, frame_h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_TRANSPARENT)
        success, encoded = cv2.imencode('.png', warped)
        if not success:
            return None
        return encoded.tobytes()

    def _map_normalized_quad_to_quad(self, norm_quad: np.ndarray, dst_quad: np.ndarray) -> np.ndarray:
        top_left, top_right, bottom_right, bottom_left = dst_quad
        result = []
        for u, v in norm_quad:
            top = top_left + (top_right - top_left) * u
            bottom = bottom_left + (bottom_right - bottom_left) * u
            point = top + (bottom - top) * v
            result.append(point)
        return np.array(result, dtype=np.float32)


overlay_preview_service = OverlayPreviewService()
