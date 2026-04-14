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
        frame_w = max(1, state_manager.state.camera.frame_width)
        frame_h = max(1, state_manager.state.camera.frame_height)
        src_h, src_w = source_rgba.shape[:2]

        dst_quad = np.array([[corner.x * frame_w, corner.y * frame_h] for corner in corners], dtype=np.float32)
        # Map the full source image directly to the full detected page quad.
        src_rect = np.array([[0, 0], [src_w - 1, 0], [src_w - 1, src_h - 1], [0, src_h - 1]], dtype=np.float32)
        matrix = cv2.getPerspectiveTransform(src_rect, dst_quad)
        warped = cv2.warpPerspective(source_rgba, matrix, (frame_w, frame_h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_TRANSPARENT)
        success, encoded = cv2.imencode('.png', warped)
        if not success:
            return None
        return encoded.tobytes()



overlay_preview_service = OverlayPreviewService()
