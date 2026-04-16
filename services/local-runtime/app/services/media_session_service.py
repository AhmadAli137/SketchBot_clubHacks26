from __future__ import annotations

from dataclasses import dataclass
import threading
from uuid import uuid4

from app.models.state import MediaSessionSummary, RTCIceServerSummary
from app.services.camera_service import camera_service
from app.services.ice_config_service import ice_config_service
from app.services.state_manager import state_manager


@dataclass
class _SignalState:
    publisher_offer_sdp: str | None = None
    publisher_offer_type: str | None = None
    viewer_answer_sdp: str | None = None
    viewer_answer_type: str | None = None
    publisher_live: bool = False
    viewer_live: bool = False


class MediaSessionService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._signals: dict[str, _SignalState] = {}

    def _sync_state(self) -> None:
        state_manager._normalize_state()
        state_manager._refresh_operator_summary()

    def _ensure_signal_state(self, session_id: str) -> _SignalState:
        signal = self._signals.get(session_id)
        if signal is None:
            signal = _SignalState()
            self._signals[session_id] = signal
        return signal

    def _require_phone_session(self, session_id: str) -> tuple[MediaSessionSummary, _SignalState]:
        state = state_manager.state
        session = state.camera.media_session
        if state.camera.source != 'phone-webrtc' or session.session_id != session_id:
            raise ValueError('Phone WebRTC session not found')
        return session, self._ensure_signal_state(session_id)

    def current_session(self) -> MediaSessionSummary:
        return state_manager.state.camera.media_session

    def provision_phone_webrtc_session(self, device_label: str | None = None, force_new: bool = False) -> MediaSessionSummary:
        state = state_manager.state
        session = state.camera.media_session

        # Keep the runtime camera service and the serialized state aligned so
        # analysis-frame uploads are accepted during phone WebRTC sessions.
        camera_service.set_source('phone-webrtc')

        previous_session_id = session.session_id
        if force_new or not session.session_id:
            session.session_id = f'ms_{uuid4().hex[:12]}'

        with self._lock:
            if force_new and previous_session_id:
                self._signals.pop(previous_session_id, None)
            if session.session_id:
                self._signals[session.session_id] = _SignalState()

        session.ingest_protocol = 'webrtc-offer-answer'
        session.viewer_protocol = 'webrtc'
        session.publisher_status = 'awaiting-publisher'
        session.viewer_status = 'idle'
        session.analysis_mode = 'sampled-downscaled'
        session.whip_url = '/api/camera/phone-webrtc/publisher-offer'
        session.viewer_path = '/api/camera/phone-webrtc/viewer-answer'
        session.ice_servers = [RTCIceServerSummary(**server) for server in ice_config_service.get_ice_servers()]
        if device_label:
            session.device_label = device_label

        state.camera.source = 'phone-webrtc'
        state.camera.source_status = 'awaiting-publisher'
        state.camera.online = False
        state.camera.supports_webrtc = True
        state.camera.latest_frame_label = 'Phone WebRTC session provisioned'
        state.camera.latest_frame_url = None
        state.camera.external_url = None

        self._sync_state()
        return session

    def store_publisher_offer(self, session_id: str, sdp: str, desc_type: str) -> MediaSessionSummary:
        with self._lock:
            session, signal = self._require_phone_session(session_id)
            signal.publisher_offer_sdp = sdp
            signal.publisher_offer_type = desc_type
            signal.viewer_answer_sdp = None
            signal.viewer_answer_type = None
            signal.publisher_live = False
            signal.viewer_live = False

            session.publisher_status = 'publishing'
            session.viewer_status = 'idle'

        state = state_manager.state
        state.camera.source_status = 'awaiting-viewer'
        state.camera.online = False
        state.camera.latest_frame_label = 'Phone publisher offer ready'
        self._sync_state()
        return session

    def get_publisher_offer(self, session_id: str) -> tuple[str, str] | None:
        with self._lock:
            _, signal = self._require_phone_session(session_id)
            if not signal.publisher_offer_sdp or not signal.publisher_offer_type:
                return None
            return signal.publisher_offer_sdp, signal.publisher_offer_type

    def store_viewer_answer(self, session_id: str, sdp: str, desc_type: str) -> MediaSessionSummary:
        with self._lock:
            session, signal = self._require_phone_session(session_id)
            if not signal.publisher_offer_sdp:
                raise ValueError('Publisher offer not found')

            signal.viewer_answer_sdp = sdp
            signal.viewer_answer_type = desc_type
            signal.viewer_live = False

            session.viewer_status = 'ready'

        state = state_manager.state
        state.camera.source_status = 'negotiating'
        state.camera.online = False
        state.camera.latest_frame_label = 'Viewer answer ready'
        self._sync_state()
        return session

    def get_viewer_answer(self, session_id: str) -> tuple[str, str] | None:
        with self._lock:
            _, signal = self._require_phone_session(session_id)
            if not signal.viewer_answer_sdp or not signal.viewer_answer_type:
                return None
            return signal.viewer_answer_sdp, signal.viewer_answer_type

    def mark_publisher_live(self, session_id: str) -> MediaSessionSummary:
        with self._lock:
            session, signal = self._require_phone_session(session_id)
            signal.publisher_live = True
            session.publisher_status = 'publishing'
            viewer_live = signal.viewer_live

        state = state_manager.state
        state.camera.source_status = 'live' if viewer_live else 'negotiating'
        state.camera.online = viewer_live
        state.camera.latest_frame_label = 'Phone publisher connected'
        self._sync_state()
        return session

    def mark_viewer_live(self, session_id: str) -> MediaSessionSummary:
        with self._lock:
            session, signal = self._require_phone_session(session_id)
            signal.viewer_live = True
            session.viewer_status = 'viewing'
            publisher_live = signal.publisher_live

        state = state_manager.state
        state.camera.source_status = 'live' if publisher_live else 'negotiating'
        state.camera.online = publisher_live
        state.camera.latest_frame_label = 'Phone WebRTC viewer connected'
        self._sync_state()
        return session

    def mark_publisher_stopped(self, session_id: str) -> MediaSessionSummary:
        with self._lock:
            session, signal = self._require_phone_session(session_id)
            signal.publisher_live = False
            signal.publisher_offer_sdp = None
            signal.publisher_offer_type = None
            signal.viewer_answer_sdp = None
            signal.viewer_answer_type = None
            signal.viewer_live = False
            session.publisher_status = 'awaiting-publisher'
            session.viewer_status = 'idle'

        state = state_manager.state
        state.camera.source_status = 'awaiting-publisher'
        state.camera.online = False
        state.camera.latest_frame_label = 'Waiting for phone publisher'
        self._sync_state()
        return session

    def mark_viewer_stopped(self, session_id: str) -> MediaSessionSummary:
        with self._lock:
            session, signal = self._require_phone_session(session_id)
            signal.viewer_live = False
            session.viewer_status = 'idle'
            publisher_live = signal.publisher_live

        state = state_manager.state
        state.camera.source_status = 'awaiting-viewer' if publisher_live else 'awaiting-publisher'
        state.camera.online = False
        state.camera.latest_frame_label = 'Waiting for dashboard viewer'
        self._sync_state()
        return session


media_session_service = MediaSessionService()
