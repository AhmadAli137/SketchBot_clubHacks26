from app.services.state_manager import state_manager


class OverlayService:
    def set_path_label(self, label: str) -> None:
        state_manager.state.overlay.path_label = label

    def set_overlay_asset(self, *, svg_path: str | None = None, image_data_url: str | None = None, source_name: str | None = None, source_kind: str | None = None) -> None:
        state = state_manager.state.overlay
        state.svg_path = svg_path
        state.image_data_url = image_data_url
        state.source_name = source_name
        state.source_kind = source_kind

    def toggle(self, enabled: bool) -> None:
        state_manager.state.overlay.enabled = enabled


overlay_service = OverlayService()
