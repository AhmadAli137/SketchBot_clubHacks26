export type Point2D = {
  x: number;
  y: number;
};

export type AprilTagDetection = {
  tag_id: number;
  family: string;
  center: Point2D;
  corners: Point2D[];
  decision_margin: number;
};

export type CanvasBorder = {
  corners: Point2D[];
  source_tag_ids: number[];
  detected: boolean;
};

export type RobotPose = {
  x_mm: number;
  y_mm: number;
  heading_deg: number;
  pen_down: boolean;
};

export type CanvasState = {
  detected: boolean;
  width_mm: number;
  height_mm: number;
  tag_ids: number[];
  confidence: number;
};

export type RTCIceServerConfig = {
  urls: string | string[];
  username?: string | null;
  credential?: string | null;
};

export type MediaSessionSummary = {
  session_id?: string | null;
  ingest_protocol?: string | null;
  viewer_protocol?: string | null;
  publisher_status: string;
  viewer_status: string;
  analysis_mode: string;
  whip_url?: string | null;
  viewer_path?: string | null;
  device_label?: string | null;
  ice_servers?: RTCIceServerConfig[];
};

export type CameraState = {
  online: boolean;
  source: string;
  source_status: string;
  latest_frame_label: string;
  latest_frame_url: string | null;
  external_url?: string | null;
  supports_webrtc?: boolean;
  media_session?: MediaSessionSummary;
  april_tag_detections: AprilTagDetection[];
  canvas_border: CanvasBorder;
};

export type OverlayState = {
  enabled: boolean;
  show_tags: boolean;
  show_path: boolean;
  show_robot: boolean;
  path_label: string;
  svg_path?: string | null;
  image_data_url?: string | null;
  source_name?: string | null;
  source_kind?: string | null;
};

export type JobSummary = {
  id: string | null;
  name: string | null;
  status: string;
  source_type: string | null;
  path_count: number;
  prompt?: string | null;
};

export type OperatorSummary = {
  status_text: string;
  last_action: string;
  mock_mode: boolean;
  connection_mode: string;
};

export type TaskRecord = {
  id: string;
  name: string;
  source_type: string;
  prompt?: string | null;
  original_filename?: string | null;
  svg_content?: string | null;
  image_data_url?: string | null;
  path_count: number;
};

export type PhoneWebRTCSessionResponse = {
  accepted: boolean;
  source: string;
  source_status: string;
  session_id: string;
  ingest_protocol: string;
  viewer_protocol: string;
  publisher_status: string;
  viewer_status: string;
  analysis_mode: string;
  whip_url?: string | null;
  viewer_path?: string | null;
  device_label?: string | null;
  ice_servers: RTCIceServerConfig[];
  message: string;
};

export type WebRTCConfigResponse = {
  ice_servers: RTCIceServerConfig[];
};

export type AppState = {
  robot_connected: boolean;
  robot_status: string;
  // Per-unit serial reported by the firmware on hello (e.g. SKETCH-A1B2-C3D4).
  // Null until a real chassis connects; used by Settings → Register Robot
  // to pre-fill the claim form on the admin web.
  robot_serial?: string | null;
  // Who's currently driving per the firmware's arbitration (Phase 2c.5).
  // 'lan' = this desktop has control, 'cloud' = another session (e.g.
  // mobile companion) is driving, 'none' = idle ≥ 250 ms, undefined when
  // we haven't heard from the firmware yet. Drives the "Driving" /
  // "Phone is driving" badge in the home toolbar.
  active_controller?: 'lan' | 'cloud' | 'none' | null;
  workflow_state: string;
  localization_confidence: number;
  camera_online: boolean;
  canvas: CanvasState;
  camera: CameraState;
  overlay: OverlayState;
  robot_pose: RobotPose;
  active_job: JobSummary;
  operator: OperatorSummary;
  recent_events: string[];
};
