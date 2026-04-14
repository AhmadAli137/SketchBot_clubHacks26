from pathlib import Path
import threading
import time
from typing import Iterator

from app.services.apriltag_service import apriltag_service
from app.services.state_manager import state_manager


FRAME_PATH = Path('/tmp/sketchbot-camera-frame.jpg')
FRAME_TMP_PATH = Path('/tmp/sketchbot-camera-frame.jpg.tmp')


class CameraService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._frame_condition = threading.Condition(self._lock)
        self._latest_frame: bytes | None = None
        self._frame_seq = 0
        self._last_ok_at: float | None = None
        self._source = 'companion-camera'
        self._external_url: str | None = None
        self._refresh_state(
            online=False,
            source='companion-camera',
            source_status='waiting',
            label='Waiting for companion app frames',
            frame_url=None,
            supports_webrtc=False,
        )

    def _refresh_state(
        self,
        online: bool,
        source: str,
        source_status: str,
        label: str,
        frame_url: str | None,
        frame_width: int | None = None,
        frame_height: int | None = None,
        external_url: str | None = None,
        supports_webrtc: bool = False,
    ) -> None:
        state = state_manager.state
        state.camera.online = online
        state.camera.source = source
        state.camera.source_status = source_status
        state.camera.latest_frame_label = label
        state.camera.latest_frame_url = frame_url
        state.camera.external_url = external_url
        state.camera.supports_webrtc = supports_webrtc
        if frame_width is not None:
            state.camera.frame_width = frame_width
        if frame_height is not None:
            state.camera.frame_height = frame_height
        state.operator.connection_mode = 'live' if online else state.operator.connection_mode
        state.operator.mock_mode = False if online else state.operator.mock_mode
        state_manager._normalize_state()
        state_manager._refresh_operator_summary()

    def _reset_latest_frame(self) -> None:
        with self._frame_condition:
            self._latest_frame = None
            self._frame_condition.notify_all()

    def _persist_frame(self, payload: bytes) -> None:
        try:
            FRAME_TMP_PATH.write_bytes(payload)
            FRAME_TMP_PATH.replace(FRAME_PATH)
        except Exception:
            pass

    def _frame_dimensions(self, payload: bytes) -> tuple[int | None, int | None]:
        try:
            import cv2
            import numpy as np

            frame = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                return None, None
            height, width = frame.shape[:2]
            return width, height
        except Exception:
            return None, None

    def _publish_frame(self, payload: bytes, *, source: str, label: str | None = None) -> bool:
        if not payload:
            return False

        with self._frame_condition:
            if source != self._source:
                return False
            self._latest_frame = payload
            self._frame_seq += 1
            self._last_ok_at = time.time()
            self._frame_condition.notify_all()

        self._persist_frame(payload)
        width, height = self._frame_dimensions(payload)
        self._refresh_state(
            True,
            source,
            'live',
            label or f'Live frame {time.strftime("%H:%M:%S")}',
            '/api/camera/stream',
            width,
            height,
            supports_webrtc=source in {'phone-webrtc', 'kit-webrtc'},
        )
        apriltag_service.update_from_frame(payload)
        return True

    def set_companion_device_label(self, label: str | None) -> None:
        normalized = (label or '').strip()
        if not normalized:
            return
        state_manager.state.camera.media_session.device_label = normalized
        state_manager._normalize_state()
        state_manager._refresh_operator_summary()

    def active_source(self) -> str:
        with self._lock:
            return self._source

    def set_source(self, source: str, external_url: str | None = None) -> None:
        normalized_external_url = external_url.strip() if external_url else None

        with self._lock:
            self._source = source
            self._external_url = normalized_external_url

        self._reset_latest_frame()
        apriltag_service.update_from_frame(None)

        if source == 'companion-camera':
            self._refresh_state(
                False,
                'companion-camera',
                'waiting',
                'Waiting for companion app frames',
                '/api/camera/stream',
                supports_webrtc=False,
            )
            return

        if source == 'browser-camera':
            self._refresh_state(
                False,
                'browser-camera',
                'waiting',
                'Waiting for this device or USB camera',
                '/api/camera/stream',
                supports_webrtc=False,
            )
            return

        if source == 'phone-webrtc':
            self._refresh_state(
                False,
                'phone-webrtc',
                'awaiting-session',
                'Phone companion session required',
                None,
                supports_webrtc=True,
            )
            return

        if source == 'kit-webrtc':
            self._refresh_state(
                False,
                'kit-webrtc',
                'awaiting-session',
                'Certified kit WebRTC session required',
                None,
                supports_webrtc=True,
            )
            return

        if source == 'external-camera':
            self._refresh_state(
                bool(normalized_external_url),
                'external-camera',
                'preview' if normalized_external_url else 'waiting',
                'External camera preview configured' if normalized_external_url else 'External camera URL required',
                normalized_external_url,
                external_url=normalized_external_url,
                supports_webrtc=False,
            )
            return

        self.set_demo_frame('Demo camera ready')

    def publish_browser_frame(self, payload: bytes) -> bool:
        with self._lock:
            self._source = 'browser-camera'
            self._external_url = None
        return self._publish_frame(payload, source='browser-camera', label=f'Device camera frame {time.strftime("%H:%M:%S")}')

    def publish_companion_frame(self, payload: bytes, device_label: str | None = None) -> bool:
        with self._lock:
            self._source = 'companion-camera'
            self._external_url = None
        self.set_companion_device_label(device_label)
        return self._publish_frame(payload, source='companion-camera', label=f'Companion frame {time.strftime("%H:%M:%S")}')

    def publish_phone_webrtc_analysis_frame(self, payload: bytes) -> bool:
        with self._lock:
            if self._source != 'phone-webrtc':
                return False
            self._external_url = None
        return self._publish_frame(payload, source='phone-webrtc', label=f'Phone analysis frame {time.strftime("%H:%M:%S")}')

    def latest_frame_exists(self) -> bool:
        with self._lock:
            return bool(self._latest_frame)

    def get_latest_frame(self) -> bytes | None:
        with self._lock:
            return self._latest_frame

    def wait_for_frame(self, last_seq: int | None = None, timeout: float = 1.0) -> tuple[bytes | None, int]:
        deadline = time.time() + timeout
        with self._frame_condition:
            while time.time() < deadline:
                if self._latest_frame is not None and (last_seq is None or self._frame_seq != last_seq):
                    return self._latest_frame, self._frame_seq
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                self._frame_condition.wait(timeout=min(0.25, remaining))
            return self._latest_frame, self._frame_seq

    def capture_frame(self) -> bool:
        if self.active_source() == 'external-camera':
            return False
        deadline = time.time() + 3
        with self._frame_condition:
            initial_seq = self._frame_seq
            if self._latest_frame:
                return True
            while time.time() < deadline:
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                self._frame_condition.wait(timeout=min(0.25, remaining))
                if self._latest_frame and self._frame_seq != initial_seq:
                    return True
        return False

    def mjpeg_stream(self) -> Iterator[bytes]:
        last_seq: int | None = None
        while True:
            payload: bytes | None = None
            with self._frame_condition:
                if self._latest_frame is None or self._frame_seq == last_seq:
                    self._frame_condition.wait(timeout=1)
                if self._latest_frame and self._frame_seq != last_seq:
                    payload = self._latest_frame
                    last_seq = self._frame_seq
            if payload:
                yield b'--frame\r\nContent-Type: image/jpeg\r\nCache-Control: no-cache\r\n\r\n' + payload + b'\r\n'

    def set_demo_frame(self, label: str) -> None:
        with self._lock:
            self._source = 'demo'
            self._external_url = None
        self._reset_latest_frame()
        self._refresh_state(
            True,
            'demo',
            'demo',
            label,
            '/api/camera/frame',
            1280,
            720,
            supports_webrtc=False,
        )
        apriltag_service.update_mock_detections()


camera_service = CameraService()
