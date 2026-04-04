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

    def _refresh_state(self, online: bool, source: str, label: str, frame_url: str | None, frame_width: int | None = None, frame_height: int | None = None) -> None:
        state = state_manager.state
        state.camera.online = online
        state.camera.source = source
        state.camera.latest_frame_label = label
        state.camera.latest_frame_url = frame_url
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

    def _publish_frame(self, payload: bytes) -> None:
        if not payload:
            return

        with self._frame_condition:
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

        self._refresh_state(True, 'pi-camera', f'Live frame {time.strftime("%H:%M:%S")}', '/api/camera/stream', width, height)
        apriltag_service.update_from_frame(payload)

    def _clear_frame(self, label: str = 'Camera capture failed') -> None:
        with self._frame_condition:
            self._latest_frame = None
        self._refresh_state(False, 'pi-camera', label, None)
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
                    saw_frame = True
                    self._publish_frame(frame)
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
            if self._producer_thread and self._producer_thread.is_alive():
                return
            self._stop_event.clear()
            self._producer_thread = threading.Thread(target=self._producer_loop, name='sketchbot-camera-producer', daemon=True)
            self._producer_thread.start()

    def stop(self) -> None:
        with self._lock:
            self._stop_event.set()
            process = self._producer_process
        if process is not None:
            try:
                process.terminate()
            except Exception:
                pass

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
        self.ensure_running()
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
        last_seq = -1
        while True:
            payload: bytes | None = None
            with self._frame_condition:
                if self._frame_seq == last_seq and not self._stop_event.is_set():
                    self._frame_condition.wait(timeout=1)
                if self._latest_frame:
                    payload = self._latest_frame
                    last_seq = self._frame_seq
            if payload:
                yield b'--frame\r\nContent-Type: image/jpeg\r\nCache-Control: no-cache\r\n\r\n' + payload + b'\r\n'

    def set_demo_frame(self, label: str) -> None:
        self._refresh_state(True, 'demo', label, '/api/camera/frame', 1280, 720)
        apriltag_service.update_mock_detections()


camera_service = CameraService()
