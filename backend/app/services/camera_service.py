from pathlib import Path
import subprocess
import threading
import time
from typing import Iterator

from app.services.apriltag_service import apriltag_service
from app.services.state_manager import state_manager


FRAME_PATH = Path('/tmp/sketchbot-camera-frame.jpg')
FRAME_TMP_PATH = Path('/tmp/sketchbot-camera-frame.jpg.tmp')
JPEG_START = b'\xff\xd8'
JPEG_END = b'\xff\xd9'


class CameraService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._frame_condition = threading.Condition(self._lock)
        self._producer_thread: threading.Thread | None = None
        self._producer_process: subprocess.Popen[bytes] | None = None
        self._stop_event = threading.Event()
        self._last_ok_at: float | None = None
        self._latest_frame: bytes | None = None
        self._frame_seq = 0
        self._source = 'pi-camera'
        self._external_url: str | None = None
        self._refresh_state(
            online=False,
            source='pi-camera',
            source_status='idle',
            label='Waiting for Pi camera',
            frame_url='/api/camera/stream',
            supports_webrtc=True,
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

    def _camera_command(self, width: int = 960, height: int = 540, framerate: int = 12) -> list[str]:
        return [
            'rpicam-vid',
            '--nopreview',
            '--timeout', '0',
            '--codec', 'mjpeg',
            '--inline',
            '--width', str(width),
            '--height', str(height),
            '--framerate', str(framerate),
            '--output', '-',
        ]

    def _reset_latest_frame(self) -> None:
        with self._frame_condition:
            self._latest_frame = None
            self._frame_condition.notify_all()

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

        try:
            FRAME_TMP_PATH.write_bytes(payload)
            FRAME_TMP_PATH.replace(FRAME_PATH)
        except Exception:
            pass

        width = height = None
        try:
            import numpy as np
            import cv2
            frame = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
            if frame is not None:
                height, width = frame.shape[:2]
        except Exception:
            pass

        self._refresh_state(
            True,
            source,
            'live',
            label or f'Live frame {time.strftime("%H:%M:%S")}',
            '/api/camera/stream',
            width,
            height,
            supports_webrtc=source in {'pi-camera', 'phone-webrtc'},
        )
        apriltag_service.update_from_frame(payload)
        return True

    def _clear_frame(self, label: str = 'Camera capture failed') -> None:
        with self._lock:
            if self._source != 'pi-camera':
                return
        self._reset_latest_frame()
        self._refresh_state(
            False,
            'pi-camera',
            'offline',
            label,
            '/api/camera/stream',
            supports_webrtc=True,
        )
        apriltag_service.update_from_frame(None)

    def _read_frames(self, stream) -> Iterator[bytes]:
        buffer = bytearray()
        while not self._stop_event.is_set():
            chunk = stream.read(65536)
            if not chunk:
                break
            buffer.extend(chunk)

            while True:
                start = buffer.find(JPEG_START)
                if start < 0:
                    if len(buffer) > len(JPEG_START):
                        del buffer[:-len(JPEG_START)]
                    break

                end = buffer.find(JPEG_END, start + 2)
                if end < 0:
                    if start > 0:
                        del buffer[:start]
                    break

                frame = bytes(buffer[start:end + 2])
                del buffer[:end + 2]
                yield frame

    def _producer_loop(self) -> None:
        while not self._stop_event.is_set():
            process: subprocess.Popen[bytes] | None = None
            try:
                process = subprocess.Popen(
                    self._camera_command(),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    bufsize=0,
                )
                with self._lock:
                    self._producer_process = process

                if process.stdout is None:
                    raise RuntimeError('camera stdout unavailable')

                saw_frame = False
                for frame in self._read_frames(process.stdout):
                    with self._lock:
                        if self._source != 'pi-camera':
                            break
                    saw_frame = True
                    self._publish_frame(frame, source='pi-camera')
                    if self._stop_event.is_set():
                        break

                if not saw_frame:
                    self._clear_frame('Camera stream unavailable')
            except Exception:
                self._clear_frame('Camera capture failed')
            finally:
                if process is not None:
                    try:
                        process.terminate()
                        process.wait(timeout=1)
                    except Exception:
                        try:
                            process.kill()
                        except Exception:
                            pass
                with self._lock:
                    if self._producer_process is process:
                        self._producer_process = None

            if not self._stop_event.is_set():
                time.sleep(1)

    def ensure_running(self) -> None:
        with self._lock:
            if self._source != 'pi-camera':
                return
            if self._producer_thread and self._producer_thread.is_alive():
                return
            self._stop_event.clear()
            self._producer_thread = threading.Thread(target=self._producer_loop, name='sketchbot-camera-producer', daemon=True)
            self._producer_thread.start()

    def stop(self) -> None:
        with self._lock:
            self._stop_event.set()
            process = self._producer_process
            thread = self._producer_thread
        if process is not None:
            try:
                process.terminate()
            except Exception:
                pass
        if thread is not None and thread.is_alive():
            thread.join(timeout=1)
        with self._lock:
            if self._producer_thread is thread and thread is not None and not thread.is_alive():
                self._producer_thread = None

    def active_source(self) -> str:
        with self._lock:
            return self._source

    def set_source(self, source: str, external_url: str | None = None) -> None:
        normalized_external_url = external_url.strip() if external_url else None

        with self._lock:
            self._source = source
            self._external_url = normalized_external_url

        if source != 'pi-camera':
            self.stop()
            self._stop_event.clear()

        if source == 'pi-camera':
            self._reset_latest_frame()
            apriltag_service.update_from_frame(None)
            self._refresh_state(
                False,
                'pi-camera',
                'starting',
                'Starting Pi camera',
                '/api/camera/stream',
                supports_webrtc=True,
            )
            self.ensure_running()
            return

        if source == 'browser-camera':
            self._reset_latest_frame()
            apriltag_service.update_from_frame(None)
            self._refresh_state(
                False,
                'browser-camera',
                'waiting',
                'Waiting for browser camera upload',
                '/api/camera/stream',
                supports_webrtc=False,
            )
            return

        if source == 'phone-webrtc':
            self._reset_latest_frame()
            apriltag_service.update_from_frame(None)
            self._refresh_state(
                False,
                'phone-webrtc',
                'awaiting-session',
                'Phone WebRTC session required',
                None,
                supports_webrtc=True,
            )
            return

        if source == 'external-camera':
            self._reset_latest_frame()
            apriltag_service.update_from_frame(None)
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
        self._stop_event.clear()
        return self._publish_frame(payload, source='browser-camera', label=f'Phone frame {time.strftime("%H:%M:%S")}')

    def publish_phone_webrtc_analysis_frame(self, payload: bytes) -> bool:
        with self._lock:
            if self._source != 'phone-webrtc':
                return False
            self._external_url = None
        self._stop_event.clear()
        return self._publish_frame(payload, source='phone-webrtc', label=f'Phone analysis frame {time.strftime("%H:%M:%S")}')

    def latest_frame_exists(self) -> bool:
        with self._lock:
            return bool(self._latest_frame)

    def get_latest_frame(self) -> bytes | None:
        with self._lock:
            return self._latest_frame

    def wait_for_frame(self, last_seq: int | None = None, timeout: float = 1.0) -> tuple[bytes | None, int]:
        self.ensure_running()
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
        if self.active_source() == 'pi-camera':
            self.ensure_running()
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
        self.ensure_running()
        last_seq: int | None = None
        while True:
            payload: bytes | None = None
            with self._frame_condition:
                if (self._latest_frame is None or self._frame_seq == last_seq) and not self._stop_event.is_set():
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
        self.stop()
        self._stop_event.clear()
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
