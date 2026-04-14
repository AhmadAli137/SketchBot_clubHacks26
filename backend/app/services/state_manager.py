from app.models.state import AppState


class StateManager:
    def __init__(self) -> None:
        self.state = AppState()
        self._normalize_state()
        self._refresh_operator_summary()

    def snapshot(self) -> dict:
        self._normalize_state()
        self._refresh_operator_summary()
        return self.state.model_dump()

    def add_event(self, event: str) -> None:
        self.state.recent_events = [event, *self.state.recent_events[:9]]
        self.state.operator.last_action = event
        self._normalize_state()
        self._refresh_operator_summary()

    def _normalize_state(self) -> None:
        state = self.state

        state.robot.connection_state = 'connected' if state.robot_connected else 'disconnected'
        state.robot.runtime_state = state.robot_status or 'idle'
        state.robot.motion_state = 'idle' if state.robot_status in {'disconnected', 'idle', 'mock_connected'} else 'active'
        state.robot.pen_state = 'down' if state.robot_pose.pen_down else 'up'
        state.robot.is_homed = state.robot_status in {'idle', 'mock_connected', 'ready'}
        state.robot.pose = state.robot_pose

        if state.active_job.status in {'draft', 'planned', 'ready'}:
            task_state = state.active_job.status
        elif state.active_job.status in {'uploaded'}:
            task_state = 'draft'
        elif state.workflow_state in {'draft_ready', 'plan_ready'}:
            task_state = 'draft'
        else:
            task_state = 'idle'

        state.workflow.task_state = task_state
        state.workflow.active_job_id = state.active_job.id
        state.workflow.is_mock_mode = state.operator.connection_mode == 'mock'

    def _refresh_operator_summary(self) -> None:
        state = self.state
        connection_mode = state.operator.connection_mode
        mock_mode = connection_mode == 'mock'

        if mock_mode and not state.robot_connected:
            status = 'Mock mode'
        elif mock_mode and state.robot_connected:
            status = 'Mock bot connected'
        elif state.camera.source == 'companion-camera' and state.camera.source_status == 'waiting':
            status = 'Waiting for companion app'
        elif state.camera.source == 'companion-camera' and state.camera.source_status == 'live':
            status = 'Companion app live'
        elif state.camera.source == 'companion-camera' and not state.camera.online:
            status = 'Companion app offline'
        elif state.camera.source == 'phone-webrtc' and state.camera.source_status == 'awaiting-session':
            status = 'Phone WebRTC session needed'
        elif state.camera.source == 'phone-webrtc' and state.camera.source_status == 'awaiting-publisher':
            status = 'Waiting for phone publisher'
        elif state.camera.source == 'phone-webrtc' and state.camera.source_status == 'awaiting-viewer':
            status = 'Waiting for dashboard viewer'
        elif state.camera.source == 'phone-webrtc' and state.camera.source_status == 'negotiating':
            status = 'Negotiating phone stream'
        elif state.camera.source == 'phone-webrtc' and state.camera.source_status == 'live':
            status = 'Phone stream live'
        elif state.camera.source == 'phone-webrtc' and not state.camera.online:
            status = 'Phone stream offline'
        elif state.camera.source == 'kit-webrtc' and state.camera.source_status == 'awaiting-session':
            status = 'Certified kit session needed'
        elif state.camera.source == 'kit-webrtc' and state.camera.source_status == 'awaiting-publisher':
            status = 'Waiting for certified kit camera'
        elif state.camera.source == 'kit-webrtc' and state.camera.source_status == 'awaiting-viewer':
            status = 'Waiting for dashboard viewer'
        elif state.camera.source == 'kit-webrtc' and state.camera.source_status == 'negotiating':
            status = 'Negotiating certified kit stream'
        elif state.camera.source == 'kit-webrtc' and state.camera.source_status == 'live':
            status = 'Certified kit stream live'
        elif state.camera.source == 'kit-webrtc' and not state.camera.online:
            status = 'Certified kit camera offline'
        elif state.camera.source == 'browser-camera' and not state.camera.online:
            status = 'Waiting for device or USB camera'
        elif state.camera.source == 'external-camera' and not state.camera.external_url:
            status = 'External camera URL needed'
        elif state.camera.source == 'external-camera':
            status = 'External camera preview'
        elif not state.camera.online:
            status = 'Camera offline'
        elif not state.canvas.detected:
            status = 'Waiting for localization'
        elif state.workflow.task_state in {'draft', 'planned', 'ready'}:
            status = 'Task ready'
        else:
            status = 'Ready'

        state.operator.status_text = status
        state.operator.mock_mode = mock_mode
        state.camera_online = state.camera.online


state_manager = StateManager()
