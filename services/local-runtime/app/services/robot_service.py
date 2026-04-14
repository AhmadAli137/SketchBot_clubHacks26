from app.services.state_manager import state_manager


class RobotService:
    def issue_command(self, command: str) -> None:
        state = state_manager.state

        if command == 'connect_mock_bot':
            state.robot_connected = True
            state.robot_status = 'mock_connected'
            state.operator.connection_mode = 'mock'
            state_manager.add_event('Mock bot connected')
            return

        state.operator.connection_mode = 'real' if state.robot_connected else 'mock'
        state.robot_status = f'command:{command}'
        state_manager.add_event(f'Robot command queued: {command}')


robot_service = RobotService()
