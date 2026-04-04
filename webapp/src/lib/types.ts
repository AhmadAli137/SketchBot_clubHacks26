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

export type CameraState = {
  online: boolean;
  source: string;
  latest_frame_label: string;
  latest_frame_url: string | null;
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

export type AppState = {
  robot_connected: boolean;
  robot_status: string;
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
