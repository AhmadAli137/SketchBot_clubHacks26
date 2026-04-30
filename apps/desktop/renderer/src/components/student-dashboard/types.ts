import type { RefObject, MutableRefObject, ChangeEvent, FormEvent, ReactNode } from 'react';

import type { AprilTagDetection, CanvasBorder, TaskRecord } from '@/lib/types';
import type { ClassroomProfile } from '@/lib/platform-types';
import type { AgeGroup, ConceptLayer } from '@/lib/concept-types';
import type { BlockProgram } from '@/components/block-editor';

export type DashboardStatusItem = { label: string; value: string };
export type InteractionMode = 'rules' | 'blocks' | 'code' | 'arduino';

export type StudentDashboardProps = {
  topStatus: DashboardStatusItem[];
  operatorMode: string;
  backendReachable: boolean;
  cameraReady: boolean;
  canvasReady: boolean;
  drawingReady: boolean;
  robotReady: boolean;
  cameraSource: string;
  cameraFrameUrl: string | null;
  cameraStatus: string;
  cameraSourceStatus: string;
  companionConnectionStatus: string;
  browserCameraStatus: string;
  companionBackendUrl: string;
  classroomJoinCode: string;
  browserCameraReady: boolean;
  phoneViewerReady: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onVideoMount: (el: HTMLVideoElement | null) => void;
  sourceSaving: boolean;
  backendLinkCopied: boolean;
  cameraModeLabel: string;
  canvasDetected: boolean;
  aprilTagCount: number;
  aprilTagDetections: AprilTagDetection[];
  canvasBorder: CanvasBorder;
  overlayPreviewUrl: string | null;
  liveCameraOverlayUrl: string | null;
  liveMarkerOverlayUrl: string | null;
  overlayPreviewLabel: string;
  prompt: string;
  composing: boolean;
  uploading: boolean;
  featuredTasks: TaskRecord[];
  activeJobName: string | null;
  nextActionTitle: string;
  nextActionCopy: string;
  conceptId?: string | null;
  conceptTitle?: string;
  ageGroup?: AgeGroup;
  studentName?: string;
  apiBase?: string;
  /** Set when the session was started from lesson-planning flow. */
  lessonPlanActive?: boolean;
  /** Challenge ID selected from the home-screen challenge library. */
  activeChallengeId?: string | null;
  /** Called when the active challenge lesson completes or is dismissed. */
  onChallengeComplete?: () => void;
  /** Drives which UI surfaces are shown. 'sandbox' = free draw, prompt bar visible. */
  appMode?: 'sandbox' | 'tutor' | 'classroom';
  /** Classroom policy from teacher profile (student sessions only). */
  classroomRestrictions?: ClassroomProfile['restrictions'];
  /** Signed-in role from desktop auth (for UI policy). */
  userRole?: 'teacher' | 'student' | 'guest';
  /** Active SavedSession id this workspace persists to. null = ephemeral session. */
  sessionId?: string | null;
  onConceptSelect?: (conceptId: string, conceptTitle: string) => void;
  onBackToHome?: () => void;
  onChangeDifficulty?: () => void;
  onActivateCompanionCamera: () => void;
  onActivateBrowserCamera: () => void;
  onDeactivateCamera: () => void;
  onCopyBackendUrl: () => void;
  onPromptChange: (value: string) => void;
  onSubmitPrompt: (event: FormEvent) => void;
  onUploadFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadTask: (task: TaskRecord) => void;
};

export type LearningHeaderProps = {
  conceptId: string | null;
  conceptTitle: string;
  ageGroup: AgeGroup;
  sysStatus: 'live' | 'sim' | 'error';
  sysLabel: string;
  topStatus: DashboardStatusItem[];
  showSimulator: boolean;
  showSystemStatus: boolean;
  studentName?: string;
  xp?: number;
  level?: number;
  levelName?: string;
  levelEmoji?: string;
  xpProgress?: number;
  nextXP?: number;
  streakDays?: number;
  sparks?: number;
  creditsRemaining?: number;
  monthlyCredits?: number;
  planTier?: string;
  /** Small avatar (emoji or robot) next to the menu when signed in as a student. */
  profileAvatar?: ReactNode;
  onBackToHome?: () => void;
  onAgeGroupChange: (ageGroup: AgeGroup) => void;
  onOpenConceptMap: () => void;
  onConceptSelect?: (conceptId: string, conceptTitle: string) => void;
  onToggleSystemStatus: () => void;
  onClosePopover: () => void;
  onChangeDifficulty?: () => void;
};

export type LearningStageProps = {
  showSimulator: boolean;
  shouldMountVideo: boolean;
  cameraConnecting: boolean;
  cameraFrameUrl: string | null;
  cameraBuddyQrUrl: string | null;
  sourceSaving: boolean;
  backendLinkCopied: boolean;
  cameraSource: string;
  browserCameraStatus: string;
  companionConnectionStatus: string;
  cameraWaitingMessage: string | null;
  cameraReady: boolean;
  canvasDetected: boolean;
  classroomJoinCode: string;
  liveCameraOverlayUrl: string | null;
  liveMarkerOverlayUrl: string | null;
  aprilTagDetections: AprilTagDetection[];
  canvasBorder: CanvasBorder;
  videoRef: RefObject<HTMLVideoElement | null>;
  onVideoMount: (el: HTMLVideoElement | null) => void;
  composing: boolean;
  featuredSvgContent: string | null;
  workspaceCameraRef: MutableRefObject<HTMLDivElement | null>;
  onActivateCompanionCamera: () => void;
  onActivateBrowserCamera: () => void;
  onDeactivateCamera: () => void;
  onCopyBackendUrl: () => void;
};

export type PromptComposerProps = {
  interactionMode: InteractionMode;
  difficultyLevel?: AgeGroup;
  activeLayer: ConceptLayer;
  prompt: string;
  composing: boolean;
  uploading: boolean;
  featuredTasks: TaskRecord[];
  conceptId: string | null;
  apiBase: string;
  onPromptChange: (value: string) => void;
  onSubmitPrompt: (event: FormEvent) => void;
  onUploadFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadTask: (task: TaskRecord) => void;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onBlockRun: (program: BlockProgram) => void | Promise<void>;
  onBlockPreviewSvgChange: (svg: string | null) => void;
  onCodeSvgResult: (svg: string) => void;
  onRulesRun?: (rules: RuleSet) => void | Promise<void>;
  showCodeFocus: boolean;
  onToggleCodeFocus: () => void;
};

export type Rule = {
  id: string;
  trigger: string;
  action: string;
};

export type RuleSet = Rule[];
