'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getShortLoopBuffer, useMenuMusic } from '@/lib/menu-music'; // triggers offline render immediately
import { AnimatePresence, motion } from 'motion/react';
import { Volume2, VolumeX, UserRound } from 'lucide-react';

import { SaySparkLogo } from '@/components/sayspark-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { AuthScreen, type AuthResult, type AuthRole } from '@/components/auth-screen';
import { PlanPicker } from '@/components/onboarding/plan-picker';
import { DifficultyPicker } from '@/components/onboarding/difficulty-picker';
import { SessionBanner } from '@/components/classroom/session-banner';
import { TeacherDashboard } from '@/components/classroom/teacher-dashboard';
import { GuidedTourProvider } from '@/components/guided-tour/guided-tour-provider';
import { HomeScreen } from '@/components/home-screen';
import { StudentDashboard } from '@/components/student-dashboard';
import { UserAccountPanel } from '@/components/user-account-panel';
import { useRuntimeConfig } from '@/lib/config';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useDesktopShell } from '@/lib/desktop-shell';
import { mockState } from '@/lib/mock-state';
import type {
  AppState,
  MediaSessionSummary,
  RTCIceServerConfig,
  TaskRecord,
  WebRTCConfigResponse,
} from '@/lib/types';
import type { AgeGroup } from '@/lib/concept-types';
import { signOutAuth, loadAccount } from '@/lib/account-storage';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getDifficultyLevel, setDifficultyLevel, getStudentProgress } from '@/lib/progress-store';
import { StudentProfileAvatar } from '@/components/student-profile-avatar';
import { loadClassroomProfile, saveClassroomProfile } from '@/lib/classroom-profile';
import { getClassSession, setClassSession, type ClassSession } from '@/lib/session-store';
import { canUpload, canUseFreeDraw, isConceptAllowed } from '@/lib/classroom-restrictions';
import type { ClassroomProfile } from '@/lib/platform-types';
import type { StartSessionOptions } from '@/components/home-screen';
import { updateSession as updateSavedSession, createSession as createSavedSession, SAVE_NOW_EVENT } from '@/lib/session-storage';
import { useSparkIdle } from '@/lib/use-spark-idle';
import { emitSparkEvent } from '@/lib/spark-events';
import { useCloudKeepalive } from '@/lib/use-cloud-keepalive';
// Phase 2a: feed live robot pose / status into the narrator so Spark's
// observation prompts include what's actually happening on the chassis.
// ensureNarratorSubscribed() wires the program-event → spark-event relay.
import { setRobotSnapshot, ensureNarratorSubscribed } from '@/lib/program-narrator';

type CameraSource = 'companion-camera' | 'browser-camera' | 'phone-webrtc' | 'external-camera' | 'kit-webrtc' | 'demo';
type AppView = 'plan' | 'auth' | 'difficulty-onboarding' | 'home' | 'session';
type SavedSession = { role: AuthRole; name: string; email?: string };

function readSavedSession(): (SavedSession & { view?: AppView }) | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('sketchbot-session-v1');
    if (!raw) return null;
    const saved = JSON.parse(raw) as { role?: AuthRole; name?: string; email?: string; view?: AppView };
    if ((saved.role !== 'student' && saved.role !== 'teacher') || !saved.name) return null;
    return { role: saved.role, name: saved.name, email: saved.email, view: saved.view };
  } catch {
    return null;
  }
}

function resumeViewFromSavedSession(saved: { view?: AppView }): AppView {
  const v = saved.view === 'session' ? 'home' : saved.view;
  return (!v || v === 'plan' || v === 'auth') ? 'home' : v;
}

function svgToDataUrl(svg: string | null | undefined) {
  if (!svg) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function resolveMediaUrl(url: string | null | undefined, apiBase: string) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${apiBase}${url}`;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function classroomJoinCodeFromUrl(url: string) {
  const data = new TextEncoder().encode(url);
  let hash = 0;
  for (const byte of data) {
    hash = (hash * 31 + byte) >>> 0;
  }
  return String(100000 + (hash % 900000));
}

async function waitForIceGatheringComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') {
    return;
  }

  await new Promise<void>((resolve) => {
    const onIceGatheringStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onIceGatheringStateChange);
  });
}

function rtcConfiguration(iceServers?: RTCIceServerConfig[]): RTCConfiguration {
  return {
    iceServers: (iceServers ?? []).map((server) => ({
      urls: server.urls,
      username: server.username ?? undefined,
      credential: server.credential ?? undefined,
    })),
  };
}

export default function HomePage() {
  // Spark aliveness — track user idle so the behavior coordinator can drift
  // mood + fire proactive nudges. Mounted at the root so it covers every view.
  useSparkIdle();
  // Keep the Render free-tier dyno warm during a session so Spark doesn't
  // freeze for 30-60s on a cold-start. See lib/use-cloud-keepalive.ts.
  useCloudKeepalive(true);

  const prefersReducedMotion = usePrefersReducedMotion();
  const { apiBase, wsBase } = useRuntimeConfig();
  const { launchState, pairingTargets } = useDesktopShell();
  const companionBackendUrl = useMemo(() => pairingTargets[0] ?? apiBase, [pairingTargets, apiBase]);
  const classroomJoinCode = useMemo(() => classroomJoinCodeFromUrl(companionBackendUrl), [companionBackendUrl]);

  // ─── Boot progress trickle — continuous animation during startup ───────────
  const [bootPct, setBootPct] = useState(12);
  useEffect(() => {
    if (launchState.phase !== 'starting') {
      setBootPct(100);
      return;
    }
    if (launchState.message.toLowerCase().includes('waking')) {
      setBootPct(prev => Math.max(prev, 28));
    }
    const t = setInterval(() => setBootPct(prev => Math.min(prev + 0.6, 85)), 500);
    return () => clearInterval(t);
  }, [launchState.phase, launchState.message]);

  // ─── Auth / routing state ──────────────────────────────────────────────
  // Persisted browser state hydrates after mount so SSR and first client render match.
  const [view, setView] = useState<AppView>('plan');
  const [userRole, setUserRole] = useState<AuthRole>('guest');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);

  const [showDifficultyModal, setShowDifficultyModal] = useState(false);
  const [showTeacherDash, setShowTeacherDash] = useState(false);
  const [authMode, setAuthMode] = useState<'personal' | 'teacher'>('teacher');
  const [activeClassSession, setActiveClassSession] = useState<ClassSession | null>(null);
  const [classroomName, setClassroomName] = useState('');
  const [studentCount, setStudentCount] = useState(0);
  const [classroomRestrictions, setClassroomRestrictions] = useState<ClassroomProfile['restrictions']>(undefined);
  const [lessonPlanActive, setLessonPlanActive] = useState(false);
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  // True after the user clicks Just Play — makes the home screen render its
  // sandbox-view layout (hero + sessions gallery) regardless of role.
  // Reset whenever they leave to a non-sandbox surface (auth, session view
  // entered via a tutor concept, etc.).
  const [sandboxModeRequested, setSandboxModeRequested] = useState(false);

  // ─── Music — persists across home/auth/onboarding views and PAUSES during
  //   active sessions so the sandbox / concept BGM (game-audio.ts) doesn't
  //   layer on top of menu music. Without this gate the user hears two
  //   tracks fighting each other.
  const { muted, toggleMute } = useMenuMusic(view === 'session');

  // ─── Learning system state ─────────────────────────────────────────────
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [selectedConceptTitle, setSelectedConceptTitle] = useState<string>('Free Draw');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<AgeGroup>('builder');
  const [sessionStartPrompt, setSessionStartPrompt] = useState<string>('');
  /** ID of the active SavedSession this workspace persists to. Set when home starts/resumes a session. */
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Derive avatar from stored profile so the PFP button always shows the
  // user's chosen emoji/robot, not just their name initial.
  const profileAvatar = useMemo(() => {
    if (!userName || userRole === 'guest') return null;
    const sp = getStudentProgress(userName, selectedAgeGroup);
    return {
      kind: sp.profile_avatar_kind ?? 'emoji',
      emoji: sp.avatar ?? '🤖',
      robotPreset: sp.robot_preset ?? 'orbit',
      color: sp.favorite_color ?? 'var(--cyan)',
    } as const;
  }, [userName, selectedAgeGroup, userRole]);

  // Restore signed-in state on mount, then keep it synced with Supabase auth.
  // We treat Supabase as the source of truth: as long as a Supabase session
  // exists, the user is signed in — even if the app's localStorage saved-session
  // slot was cleared, never written, or got corrupted. Without this, a stale
  // localStorage made the PFP show as guest after reopening the app.
  useEffect(() => {
    let cancelled = false;

    const hydrateFromSupabase = async () => {
      const sb = getSupabaseBrowserClient();
      if (!sb) return false;
      const { data: { session } } = await sb.auth.getSession();
      if (cancelled || !session?.user?.email) return false;
      const account = loadAccount();
      const role: AuthRole = account?.lastRole ?? 'student';
      const email = session.user.email;
      const name = account?.displayName?.trim()
        || (session.user.user_metadata?.display_name as string | undefined)?.trim()
        || (session.user.user_metadata?.name as string | undefined)?.trim()
        || email.split('@')[0];
      setUserRole(role);
      setUserName(name);
      setUserEmail(email);
      setSavedSession({ role, name, email });
      setActiveClassSession(getClassSession());
      // Keep localStorage in sync so other code paths that read it directly
      // (older callers) see the same state.
      localStorage.setItem(
        'sketchbot-session-v1',
        JSON.stringify({ role, name, email, view: 'home' }),
      );
      return true;
    };

    void hydrateFromSupabase().then((restored) => {
      if (cancelled) return;
      if (!restored) {
        // Fall back to legacy localStorage-only restore (works for dev / no-supabase).
        const saved = readSavedSession();
        if (!saved) return;
        setUserRole(saved.role);
        setUserName(saved.name);
        setUserEmail(saved.email ?? '');
        setSavedSession({ role: saved.role, name: saved.name, email: saved.email });
        setActiveClassSession(getClassSession());
        setView(resumeViewFromSavedSession(saved));
      }
    });

    // Live updates: when Supabase session changes (sign-in elsewhere, refresh,
    // sign-out), reflect it immediately so the PFP and cloud auth stay aligned.
    const sb = getSupabaseBrowserClient();
    const sub = sb?.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT' || !session?.user?.email) {
        // Only flip to guest if we were previously signed in via Supabase —
        // don't clobber a legacy localStorage session in dev mode.
        const account = loadAccount();
        if (account?.sessionToken === 'supabase') {
          setUserRole('guest');
          setUserName('');
          setUserEmail('');
          setSavedSession(null);
        }
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        void hydrateFromSupabase();
      }
    });

    return () => {
      cancelled = true;
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  // Load classroom profile on mount.
  useEffect(() => {
    try {
      const profile = loadClassroomProfile();
      setClassroomName(profile.classroomName);
      setStudentCount(profile.students.length);
      setClassroomRestrictions(profile.restrictions);
    } catch {
      // ignore
    }
  }, []);

  const handleAuthenticated = (result: AuthResult) => {
    const { role, name, email, authSource } = result;
    setUserRole(role);
    setUserName(name);
    setUserEmail(email ?? '');
    setActiveClassSession(getClassSession());
    // Coming through the auth flow means the user wants the educational
    // home, not the sandbox-view layout, so reset the sandbox request.
    setSandboxModeRequested(false);

    // Students who haven't chosen a difficulty level go to onboarding first
    let nextView: AppView = 'home';
    if (role === 'student' && name.trim()) {
      // Ensure student record exists before checking difficulty
      getStudentProgress(name, 'builder');
      const diffLevel = getDifficultyLevel(name);
      if (!diffLevel) nextView = 'difficulty-onboarding';
    }

    setView(nextView);
    localStorage.setItem(
      'sketchbot-session-v1',
      JSON.stringify({ role, name, view: nextView, email: email ?? undefined, authSource }),
    );
    if (role === 'teacher' && name.trim()) {
      const p = loadClassroomProfile();
      if (!p.teacherName.trim()) {
        p.teacherName = name.trim();
        saveClassroomProfile(p);
      }
    }
  };

  const handleDifficultyComplete = (level: AgeGroup) => {
    if (userName) {
      setDifficultyLevel(userName, level);
      setSelectedAgeGroup(level);
    }
    if (showDifficultyModal) {
      setShowDifficultyModal(false);
    } else {
      setView('home');
      localStorage.setItem(
        'sketchbot-session-v1',
        JSON.stringify({ role: userRole, name: userName, view: 'home', email: userEmail || undefined }),
      );
    }
  };

  const handleClassroomSaved = useCallback((p: ClassroomProfile) => {
    setClassroomName(p.classroomName);
    setStudentCount(p.students.length);
    setClassroomRestrictions(p.restrictions);
  }, []);

  const handleStartSession = (
    conceptId?: string,
    starterPrompt?: string,
    ageGroup?: AgeGroup,
    options?: StartSessionOptions,
  ) => {
    setSelectedConceptId(conceptId ?? null);
    setSelectedConceptTitle(options?.conceptTitle ?? (conceptId ? conceptId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Free Draw'));
    if (starterPrompt) {
      setSessionStartPrompt(starterPrompt);
      setPrompt(starterPrompt);
    }
    if (ageGroup) setSelectedAgeGroup(ageGroup);
    setLessonPlanActive(Boolean(options?.lessonPlanning));
    setActiveChallengeId(options?.challengeId ?? null);
    // Auto-create a SavedSession for fresh sandbox sessions so the Save
    // button has something to bind to. Concept sessions get one too if the
    // caller didn't pass an existing id.
    let sessionIdForView = options?.sessionId ?? null;
    if (!sessionIdForView) {
      try {
        const created = createSavedSession(userName || 'guest', {
          conceptId: conceptId ?? null,
          conceptTitle: options?.conceptTitle ?? (conceptId ? null : 'Sandbox'),
          ageGroup: ageGroup ?? selectedAgeGroup,
          prompt: starterPrompt,
        });
        sessionIdForView = created.id;
      } catch { /* localStorage may not be available; SaveStatus will hide silently */ }
    }
    setCurrentSessionId(sessionIdForView);
    setView('session');
    emitSparkEvent('session.open');
    localStorage.setItem(
      'sketchbot-session-v1',
      JSON.stringify({
        role: userRole,
        name: userName,
        view: 'session',
        email: userEmail || undefined,
      }),
    );
  };

  const handleConceptSelect = useCallback(
    (conceptId: string, conceptTitle: string) => {
      if (userRole === 'student' && classroomRestrictions) {
        if (!isConceptAllowed(conceptId, classroomRestrictions)) {
          window.alert('That topic is not available in your classroom. Ask your teacher.');
          return;
        }
      }
      setSelectedConceptId(conceptId);
      setSelectedConceptTitle(conceptTitle);
    },
    [userRole, classroomRestrictions],
  );

  const clearClassSession = () => {
    setClassSession(null);
    setActiveClassSession(null);
  };

  const handleSignOut = () => {
    void signOutAuth();
    setView('plan');
    setUserRole('guest');
    setUserName('');
    setUserEmail('');
    setLessonPlanActive(false);
    setActiveChallengeId(null);
    setShowTeacherDash(false);
    setSavedSession(null);
    clearClassSession();
    localStorage.removeItem('sketchbot-session-v1');
  };

  // ─── App state ─────────────────────────────────────────────────────────
  const [state, setState] = useState<AppState>(mockState);
  const [backendReachable, setBackendReachable] = useState(false);
  const [phoneViewerReady, setPhoneViewerReady] = useState(false);
  const [phoneViewerError, setPhoneViewerError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [prompt, setPrompt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [sourceSaving, setSourceSaving] = useState(false);
  const [sourceTransitionTarget, setSourceTransitionTarget] = useState<CameraSource | null>(null);
  const [backendLinkCopied, setBackendLinkCopied] = useState(false);
  const [webrtcIceServers, setWebrtcIceServers] = useState<RTCIceServerConfig[]>([]);
  const [browserCameraReady, setBrowserCameraReady] = useState(false);
  const [browserCameraError, setBrowserCameraError] = useState<string | null>(null);
  const [liveOverlayRefreshToken, setLiveOverlayRefreshToken] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const browserUploadCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisUploadBusyRef = useRef(false);
  const browserUploadBusyRef = useRef(false);
  const browserStreamRef = useRef<MediaStream | null>(null);
  const phonePcRef = useRef<RTCPeerConnection | null>(null);
  const phoneStreamRef = useRef<MediaStream | null>(null);
  const phoneDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-persist prompt to the active SavedSession (debounced).
  // Listens for the manual "save now" event to flush immediately.
  useEffect(() => {
    if (!currentSessionId || view !== 'session') return;
    const flush = () => updateSavedSession(userName || 'guest', currentSessionId, { prompt });
    // 2s debounce — feels responsive for typing without thrashing localStorage
    // on every keystroke. SAVE_NOW_EVENT (Save button) flushes immediately.
    const id = setTimeout(flush, 2000);
    const onSaveNow = () => { clearTimeout(id); flush(); };
    window.addEventListener(SAVE_NOW_EVENT, onSaveNow);
    return () => {
      clearTimeout(id);
      window.removeEventListener(SAVE_NOW_EVENT, onSaveNow);
    };
  }, [prompt, currentSessionId, view, userName]);

  // Track time spent in the active session
  useEffect(() => {
    if (!currentSessionId || view !== 'session') return;
    const sessionId = currentSessionId;
    const userKey = userName || 'guest';
    const startMs = Date.now();
    let lastFlush = startMs;

    // Periodically flush elapsed time so closing the app doesn't lose much
    const flushTimer = setInterval(() => {
      const now = Date.now();
      const delta = now - lastFlush;
      lastFlush = now;
      const existing = (typeof window !== 'undefined') ? (() => {
        try {
          const raw = window.localStorage.getItem(`sketchbot.sessions.v1.${userKey.toLowerCase()}`);
          const arr = raw ? JSON.parse(raw) as Array<{ id: string; totalTimeMs?: number }> : [];
          return arr.find((s) => s.id === sessionId)?.totalTimeMs ?? 0;
        } catch { return 0; }
      })() : 0;
      updateSavedSession(userKey, sessionId, { totalTimeMs: existing + delta });
    }, 30_000);

    return () => {
      clearInterval(flushTimer);
      // Final flush on session exit
      try {
        const raw = window.localStorage.getItem(`sketchbot.sessions.v1.${userKey.toLowerCase()}`);
        const arr = raw ? JSON.parse(raw) as Array<{ id: string; totalTimeMs?: number }> : [];
        const existing = arr.find((s) => s.id === sessionId)?.totalTimeMs ?? 0;
        const delta = Date.now() - lastFlush;
        updateSavedSession(userKey, sessionId, { totalTimeMs: existing + delta });
      } catch { /* noop */ }
    };
  }, [currentSessionId, view, userName]);

  const viewerIceServers = useMemo(
    () => state.camera?.media_session?.ice_servers ?? webrtcIceServers,
    [state.camera?.media_session?.ice_servers, webrtcIceServers],
  );
  const viewerIceKey = useMemo(() => JSON.stringify(viewerIceServers), [viewerIceServers]);
  const refreshTasks = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/compose/tasks`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      const payload = (await response.json()) as { tasks: TaskRecord[] };
      setTasks(payload.tasks ?? []);
    } catch {
      setTasks([]);
    }
  }, [apiBase]);

  const refreshState = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/state`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch state');
      }
      const nextState = (await response.json()) as AppState;
      setState(nextState);
      setBackendReachable(true);
    } catch {
      setBackendReachable(false);
    }
  }, [apiBase]);

  const refreshWebRTCConfig = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/webrtc/config`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch WebRTC config');
      }
      const payload = (await response.json()) as WebRTCConfigResponse;
      setWebrtcIceServers(payload.ice_servers ?? []);
    } catch {
      setWebrtcIceServers([]);
    }
  }, [apiBase]);

  useEffect(() => {
    let cancelled = false;

    // Idempotent — sets up the spark-event relay for program-narrator on
    // first mount and is a no-op on every subsequent renderer reload.
    ensureNarratorSubscribed();

    void refreshState();
    void refreshTasks();
    void refreshWebRTCConfig();

    const statePoll = window.setInterval(() => {
      if (!cancelled) {
        void refreshState();
      }
    }, 5000);

    let ws: WebSocket | null = null;
    const wsConnectTimer = window.setTimeout(() => {
      if (cancelled) return;
      ws = new WebSocket(wsBase);
      ws.onmessage = (event) => {
        try {
          const nextState = JSON.parse(event.data) as AppState;
          if (!cancelled) {
            setState(nextState);
            setBackendReachable(true);
            // Mirror robot pose / status into the narrator's snapshot so
            // Spark's observe-loop context_text reflects the chassis's
            // current state — see lib/program-narrator.ts.
            setRobotSnapshot({
              connected: !!nextState.robot_connected,
              status:    nextState.robot_status ?? 'unknown',
              poseMm: {
                x:          nextState.robot_pose?.x_mm        ?? 0,
                z:          nextState.robot_pose?.y_mm        ?? 0,
                headingDeg: nextState.robot_pose?.heading_deg ?? 0,
              },
              penDown: !!nextState.robot_pose?.pen_down,
              moving:  /mov|driv|run/i.test(nextState.robot_status ?? ''),
              homed:   /home|ready|idle/i.test(nextState.robot_status ?? ''),
            });
          }
        } catch {
          // Ignore invalid snapshots.
        }
      };
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(statePoll);
      window.clearTimeout(wsConnectTimer);
      ws?.close();
    };
  }, [refreshState, refreshTasks, refreshWebRTCConfig, wsBase]);

  useEffect(() => {
    if (sourceTransitionTarget && state.camera?.source === sourceTransitionTarget) {
      setSourceTransitionTarget(null);
    }
  }, [sourceTransitionTarget, state.camera?.source]);

  useEffect(() => {
    const sessionId = state.camera?.media_session?.session_id;
    const shouldUsePhoneWebrtc = state.camera?.source === 'phone-webrtc' && Boolean(sessionId);

    if (!shouldUsePhoneWebrtc || !sessionId) {
      setPhoneViewerReady(false);
      setPhoneViewerError(null);
      const pc = phonePcRef.current;
      if (pc) {
        pc.close();
        phonePcRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return;
    }

    let cancelled = false;
    let viewerStarted = false;
    const abortController = new AbortController();

    const startPhoneViewer = async () => {
      try {
        setPhoneViewerReady(false);
        setPhoneViewerError(null);

        let remoteOffer: { sdp: string; type: RTCSdpType } | null = null;
        for (let attempt = 0; attempt < 60; attempt += 1) {
          if (cancelled) {
            return;
          }

          const response = await fetch(`${apiBase}/api/camera/phone-webrtc/publisher-offer/${sessionId}`, {
            cache: 'no-store',
            signal: abortController.signal,
          });
          if (response.ok) {
            remoteOffer = (await response.json()) as { sdp: string; type: RTCSdpType };
            break;
          }
          if (cancelled) {
            return;
          }
          await delay(1000);
        }

        if (!remoteOffer) {
          throw new Error('Timed out waiting for the phone publisher offer.');
        }

        if (cancelled) {
          return;
        }

        viewerStarted = true;
        const pc = new RTCPeerConnection(rtcConfiguration(JSON.parse(viewerIceKey) as RTCIceServerConfig[]));
        phonePcRef.current = pc;
        pc.addTransceiver('video', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          const [stream] = event.streams;
          const targetStream = stream ?? new MediaStream([event.track]);
          phoneStreamRef.current = targetStream;

          event.track.onunmute = () => {
            if (cancelled) return;
            setPhoneViewerReady(true);
            setPhoneViewerError(null);
            if (videoRef.current) {
              videoRef.current.srcObject = targetStream;
              void videoRef.current.play().catch(() => {});
            }
          };

          setPhoneViewerReady(true);
          setPhoneViewerError(null);
          if (videoRef.current) {
            videoRef.current.srcObject = targetStream;
            void videoRef.current.play().catch(() => {});
          }
        };

        const handleDisconnect = () => {
          setPhoneViewerReady(false);
          phoneStreamRef.current = null;
          if (videoRef.current) videoRef.current.srcObject = null;
          void fetch(`${apiBase}/api/camera/phone-webrtc/viewer-stop/${sessionId}`, { method: 'POST' }).catch(() => {});
          void refreshState();
        };

        pc.onconnectionstatechange = () => {
          if (phoneDisconnectTimerRef.current) {
            clearTimeout(phoneDisconnectTimerRef.current);
            phoneDisconnectTimerRef.current = null;
          }

          if (pc.connectionState === 'connected') {
            void fetch(`${apiBase}/api/camera/phone-webrtc/viewer-live/${sessionId}`, { method: 'POST' });
          } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            if (pc.connectionState === 'failed') {
              setPhoneViewerError('Phone WebRTC connection failed.');
            }
            handleDisconnect();
          } else if (pc.connectionState === 'disconnected') {
            phoneDisconnectTimerRef.current = setTimeout(handleDisconnect, 3000);
          }
        };

        await pc.setRemoteDescription(remoteOffer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGatheringComplete(pc);

        const localDescription = pc.localDescription;
        if (!localDescription) {
          throw new Error('Viewer local description missing.');
        }

        const answerResponse = await fetch(`${apiBase}/api/camera/phone-webrtc/viewer-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            sdp: localDescription.sdp,
            type: localDescription.type,
          }),
        });

        if (!answerResponse.ok) {
          throw new Error('Failed to deliver the dashboard answer.');
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (!cancelled) {
          setPhoneViewerReady(false);
          setPhoneViewerError(error instanceof Error ? error.message : 'Unable to start the phone viewer.');
        }
      }
    };

    void startPhoneViewer();

    return () => {
      cancelled = true;
      abortController.abort();
      if (phoneDisconnectTimerRef.current) {
        clearTimeout(phoneDisconnectTimerRef.current);
        phoneDisconnectTimerRef.current = null;
      }
      const pc = phonePcRef.current;
      if (pc) {
        pc.close();
        phonePcRef.current = null;
      }
      phoneStreamRef.current = null;
      setPhoneViewerReady(false);
      if (viewerStarted) {
        void fetch(`${apiBase}/api/camera/phone-webrtc/viewer-stop/${sessionId}`, { method: 'POST' }).catch(() => {});
      }
    };
  }, [apiBase, state.camera?.media_session?.session_id, state.camera?.source, viewerIceKey, refreshState]);

  useEffect(() => {
    const shouldUseBrowserCamera = state.camera?.source === 'browser-camera';

    if (!shouldUseBrowserCamera) {
      setBrowserCameraReady(false);
      setBrowserCameraError(null);
      browserStreamRef.current?.getTracks().forEach((track) => track.stop());
      browserStreamRef.current = null;
      if (videoRef.current && state.camera?.source !== 'phone-webrtc') {
        videoRef.current.srcObject = null;
      }
      return;
    }

    let cancelled = false;

    const startBrowserCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 20, max: 24 },
          },
          audio: false,
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        browserStreamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          void videoRef.current.play().catch(() => {});
        }
        setBrowserCameraReady(true);
        setBrowserCameraError(null);
      } catch (error) {
        if (!cancelled) {
          setBrowserCameraReady(false);
          setBrowserCameraError(error instanceof Error ? error.message : 'Unable to access this device camera.');
        }
      }
    };

    void startBrowserCamera();

    return () => {
      cancelled = true;
      browserStreamRef.current?.getTracks().forEach((track) => track.stop());
      browserStreamRef.current = null;
      setBrowserCameraReady(false);
    };
  }, [state.camera?.source]);

  useEffect(() => {
    if (state.camera?.source !== 'browser-camera' || !browserCameraReady) {
      return;
    }

    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || browserUploadBusyRef.current || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      browserUploadBusyRef.current = true;
      try {
        const canvas = browserUploadCanvasRef.current ?? document.createElement('canvas');
        browserUploadCanvasRef.current = canvas;
        const targetWidth = Math.min(1280, Math.max(960, video.videoWidth));
        const aspectRatio = video.videoHeight / Math.max(video.videoWidth, 1);
        canvas.width = targetWidth;
        canvas.height = Math.max(1, Math.round(targetWidth * aspectRatio));
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Camera canvas unavailable.');
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
        if (!blob) {
          throw new Error('Unable to encode camera frame.');
        }

        const response = await fetch(`${apiBase}/api/camera/browser-frame`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        });
        if (!response.ok) {
          throw new Error('USB camera upload failed.');
        }
      } catch (error) {
        setBrowserCameraError(error instanceof Error ? error.message : 'USB camera upload failed.');
      } finally {
        browserUploadBusyRef.current = false;
      }
    }, 350);

    return () => {
      window.clearInterval(timer);
    };
  }, [apiBase, browserCameraReady, state.camera?.source]);

  useEffect(() => {
    const sessionId = state.camera?.media_session?.session_id;
    if (state.camera?.source !== 'phone-webrtc' || !phoneViewerReady || !sessionId) {
      return;
    }

    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || analysisUploadBusyRef.current || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      analysisUploadBusyRef.current = true;
      try {
        const canvas = analysisCanvasRef.current ?? document.createElement('canvas');
        analysisCanvasRef.current = canvas;

        const targetWidth = Math.min(1280, Math.max(960, video.videoWidth));
        const aspectRatio = video.videoHeight / Math.max(video.videoWidth, 1);
        canvas.width = targetWidth;
        canvas.height = Math.max(1, Math.round(targetWidth * aspectRatio));

        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Analysis canvas context unavailable.');
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
        if (!blob) {
          throw new Error('Unable to encode analysis frame.');
        }

        await fetch(`${apiBase}/api/camera/phone-webrtc/analysis-frame`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        });
      } catch {
        // Keep the live viewer running even if analysis sampling briefly fails.
      } finally {
        analysisUploadBusyRef.current = false;
      }
    }, 300);

    return () => {
      window.clearInterval(timer);
    };
  }, [apiBase, phoneViewerReady, state.camera?.media_session?.session_id, state.camera?.source]);

  useEffect(() => {
    const overlayReady = Boolean(
      state.overlay?.image_data_url ||
      tasks.some((task) => task.id === state.active_job?.id && task.svg_content),
    );

    if (!state.camera?.online || !state.canvas?.detected || !overlayReady) {
      setLiveOverlayRefreshToken(0);
      return;
    }

    const refresh = () => {
      setLiveOverlayRefreshToken(Date.now());
    };

    refresh();
    const timer = window.setInterval(refresh, 850);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    state.active_job?.id,
    state.camera?.online,
    state.canvas?.detected,
    state.overlay?.image_data_url,
    tasks,
  ]);

  const applyCameraSource = async (source: CameraSource) => {
    setSourceTransitionTarget(source);
    setSourceSaving(true);
    try {
      await fetch(`${apiBase}/api/camera/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          external_url: null,
        }),
      });
      await refreshState();
    } finally {
      setSourceTransitionTarget(null);
      setSourceSaving(false);
    }
  };

  const activateCompanionCamera = async () => {
    await applyCameraSource('phone-webrtc');
  };

  const activateBrowserCamera = async () => {
    await applyCameraSource('browser-camera');
  };

  const deactivateCamera = async () => {
    browserStreamRef.current?.getTracks().forEach((t) => t.stop());
    browserStreamRef.current = null;
    if (phoneDisconnectTimerRef.current) {
      clearTimeout(phoneDisconnectTimerRef.current);
      phoneDisconnectTimerRef.current = null;
    }
    const pc = phonePcRef.current;
    if (pc) {
      pc.close();
      phonePcRef.current = null;
    }
    phoneStreamRef.current = null;
    setPhoneViewerReady(false);
    setBrowserCameraReady(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    await applyCameraSource('companion-camera');
  };

  const handleVideoMount = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (!el) return;
      const source = state.camera?.source;
      if (source === 'browser-camera' && browserStreamRef.current) {
        el.srcObject = browserStreamRef.current;
        void el.play().catch(() => {});
      } else if (source === 'phone-webrtc' && phoneStreamRef.current) {
        el.srcObject = phoneStreamRef.current;
        void el.play().catch(() => {});
      }
    },
    [state.camera?.source],
  );

  const copyBackendUrl = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(companionBackendUrl);
      setBackendLinkCopied(true);
      window.setTimeout(() => setBackendLinkCopied(false), 1800);
    } catch {
      setBackendLinkCopied(false);
    }
  };

  const submitPrompt = async (event: FormEvent) => {
    event.preventDefault();
    if (userRole === 'student' && classroomRestrictions) {
      if (!selectedConceptId && !canUseFreeDraw(classroomRestrictions)) {
        window.alert('Free Draw is turned off for your classroom.');
        return;
      }
    }
    setComposing(true);
    try {
      await fetch(`${apiBase}/api/compose/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      await Promise.all([refreshTasks(), refreshState()]);
      setPrompt('');
    } finally {
      setComposing(false);
    }
  };

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (userRole === 'student' && classroomRestrictions && !canUpload(classroomRestrictions)) {
      window.alert('Uploads are disabled for your classroom.');
      event.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await fetch(`${apiBase}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      await Promise.all([refreshTasks(), refreshState()]);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const loadTask = async (task: TaskRecord) => {
    if (task.source_type !== 'prompt' || !task.prompt) {
      return;
    }

    await fetch(`${apiBase}/api/compose/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: task.prompt }),
    });
    await Promise.all([refreshTasks(), refreshState()]);
  };

  const activeJob = state.active_job ?? { id: null, name: null, status: 'idle', source_type: null, path_count: 0, prompt: null };
  const camera = state.camera ?? {
    online: false,
    source: 'unavailable',
    source_status: 'offline',
    latest_frame_label: 'No camera frame',
    latest_frame_url: null,
    external_url: null,
    supports_webrtc: false,
    media_session: {
      publisher_status: 'idle',
      viewer_status: 'idle',
      analysis_mode: 'direct-frame',
      ice_servers: [],
    },
    april_tag_detections: [],
    canvas_border: { corners: [], source_tag_ids: [], detected: false },
  };
  const mediaSession: MediaSessionSummary = camera.media_session ?? {
    publisher_status: 'idle',
    viewer_status: 'idle',
    analysis_mode: 'direct-frame',
    ice_servers: [],
  };
  const canvas = state.canvas ?? { detected: false, width_mm: 297, height_mm: 210, tag_ids: [0, 1, 2, 3], confidence: 0 };
  const overlay = state.overlay ?? {
    enabled: true,
    show_tags: true,
    show_path: true,
    show_robot: true,
    path_label: 'No task loaded',
    svg_path: null,
    image_data_url: null,
    source_name: null,
    source_kind: null,
  };
  const operator = state.operator ?? {
    status_text: 'Connecting to the desktop runtime',
    last_action: 'Waiting for operator',
    mock_mode: false,
    connection_mode: 'live',
  };

  const taskReady = activeJob.status === 'draft' || activeJob.status === 'planned' || activeJob.status === 'ready';
  const shouldShowFallbackCameraStream =
    camera.online &&
    (camera.source === 'browser-camera' || camera.source === 'companion-camera') &&
    !camera.latest_frame_url;
  const cameraFrameUrl = resolveMediaUrl(camera.latest_frame_url, apiBase) ?? (shouldShowFallbackCameraStream ? `${apiBase}/api/camera/stream` : null);
  const activeTaskRecord = tasks.find((task) => task.id === activeJob.id) ?? null;
  const activePreviewUrl = overlay.image_data_url ?? svgToDataUrl(activeTaskRecord?.svg_content ?? null);
  const overlaySourceAvailable = Boolean(overlay.image_data_url || activeTaskRecord?.svg_content);
  const liveCameraOverlayUrl =
    liveOverlayRefreshToken > 0 && overlaySourceAvailable && canvas.detected
      ? `${apiBase}/api/camera/overlay-preview?ts=${liveOverlayRefreshToken}`
      : null;
  const liveMarkerOverlayUrl =
    liveOverlayRefreshToken > 0 &&
    (camera.april_tag_detections.length > 0 || camera.canvas_border.detected)
      ? `${apiBase}/api/camera/marker-overlay?ts=${liveOverlayRefreshToken}`
      : null;
  const topStatus = useMemo(
    () => [
      { label: 'App', value: backendReachable ? 'Ready' : 'Starting' },
      { label: 'Camera', value: camera.online ? 'Live' : camera.source_status },
      { label: 'Robot', value: state.robot_connected ? 'Connected' : 'Not connected' },
    ],
    [backendReachable, camera.online, camera.source_status, state.robot_connected],
  );

  const companionConnectionStatus =
    camera.source === 'phone-webrtc'
      ? (phoneViewerReady
        ? `Camera Buddy is live${mediaSession.device_label ? ` (${mediaSession.device_label})` : ''}`
        : phoneViewerError ??
          (mediaSession.publisher_status === 'awaiting-publisher'
            ? 'Waiting for Camera Buddy to tap Go Live on the same Wi-Fi.'
            : mediaSession.viewer_status === 'idle'
              ? 'Waiting for SketchBot Desktop to finish connecting the live stream.'
              : camera.latest_frame_label))
      : camera.source === 'companion-camera'
        ? (camera.online
          ? `${camera.latest_frame_label}${mediaSession.device_label ? ` (${mediaSession.device_label})` : ''}`
          : 'Waiting for Camera Buddy on the same Wi-Fi.')
      : 'Choose Camera Buddy to use a phone or tablet.';
  const browserCameraStatus =
    camera.source === 'browser-camera'
      ? (browserCameraReady ? 'This computer camera is live.' : browserCameraError ?? 'Waiting for camera permission on this computer.')
      : 'Choose This Device if the camera is plugged into the computer.';

  const nextActionTitle = camera.online
    ? canvas.detected
      ? taskReady
        ? 'You are ready to draw'
        : 'Make or load a drawing'
      : 'Point the camera at the paper'
    : camera.source === 'browser-camera'
      ? 'Allow the computer camera'
      : 'Open Camera Buddy and tap Go Live';
  const nextActionCopy = camera.online
    ? canvas.detected
      ? taskReady
        ? 'Check the overlay, then start the robot when everyone is ready.'
        : 'The paper is found. Now make a drawing or load one from the recent list.'
      : 'Keep the full sheet and every AprilTag in view so SketchBot can find the page.'
    : camera.source === 'browser-camera'
      ? 'This path is best for a webcam, document camera, or USB camera plugged into the laptop.'
      : 'Camera Buddy is the easiest classroom setup. Keep the phone or tablet on the same Wi-Fi as this computer.';
  const cameraModeLabel =
    camera.source === 'browser-camera'
      ? 'This Device camera'
      : camera.source === 'companion-camera' || camera.source === 'phone-webrtc'
        ? 'Camera Buddy'
        : 'Camera Buddy';
  const featuredTasks = tasks.slice(0, 3);

  const viewTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

  const viewVariants = prefersReducedMotion
    ? {
        initial: { opacity: 1, y: 0 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 1, y: 0 },
      }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
      };

  // ─── Auth / home / session with shared motion shell ───────────────────
  return (
    <GuidedTourProvider activeView={view === 'plan' || view === 'difficulty-onboarding' ? 'auth' : view as 'auth' | 'home' | 'session'} userRole={userRole} lessonActive={lessonPlanActive} lessonPlayerActive={activeChallengeId !== null}>
      <AnimatePresence mode="wait">
        {view === 'plan' && launchState.phase === 'starting' && (
          <motion.div
            key="loading"
            className="plan-boot-screen"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Animated blobs */}
            <div className="plan-boot-blobs" aria-hidden="true">
              <div className="plan-boot-blob-a" />
              <div className="plan-boot-blob-b" />
            </div>

            {/* Center content */}
            <div className="plan-boot-center">
              {/* Logo mark with ring pulses */}
              <div className="plan-boot-mark-wrap" aria-hidden="true">
                <div className="plan-boot-ring" />
                <div className="plan-boot-ring plan-boot-ring-d" />
                <SaySparkLogo size={72} showWordmark={false} animate={false} />
              </div>

              {/* Wordmark */}
              <p className="plan-boot-wordmark-name">
                <span className="plan-boot-wordmark-ai">Ai</span>botics
              </p>
              <p className="plan-boot-wordmark-sub">AI Robotics Studio</p>

              {/* Progress bar + status */}
              <div className="plan-boot-load-area">
                <div className="plan-boot-message">
                  {launchState.message}
                </div>
                <div className="plan-boot-track" aria-hidden="true">
                  <motion.div
                    className="plan-boot-fill"
                    animate={{ width: `${bootPct}%` }}
                    transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {view === 'plan' && launchState.phase !== 'starting' && (
          <motion.div
            key="plan"
            className="min-h-[100dvh]"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={viewTransition}
          >
            <PlanPicker
              apiBase={apiBase}
              savedSession={savedSession ?? undefined}
              onPicked={(result) => {
                setSavedSession(null);
                handleAuthenticated(result);
              }}
              onJustPlay={() => {
                // Sandbox is open to everyone. Preserve any existing session
                // (signed-in users keep their PFP + cloud auth). Land on the
                // home screen in sandbox-view mode so the user sees the
                // sessions gallery (resume / new) before diving in.
                if (userRole === 'guest' && !userName.trim()) {
                  setUserName('Player');
                }
                setSelectedConceptId(null);
                setSelectedConceptTitle('Free Draw');
                setLessonPlanActive(false);
                setActiveChallengeId(null);
                setSandboxModeRequested(true);
                setView('home');
              }}
              onTeacherAuth={() => { setAuthMode('teacher'); setView('auth'); }}
              onPersonalTutor={() => { setAuthMode('personal'); setView('auth'); }}
              onClearSavedSession={() => handleSignOut()}
            />
          </motion.div>
        )}
        {view === 'auth' && (
          <motion.div
            key="auth"
            className="min-h-[100dvh]"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={viewTransition}
          >
            <AuthScreen
              onAuthenticated={handleAuthenticated}
              onBack={() => setView('plan')}
              authMode={authMode}
            />
          </motion.div>
        )}
        {view === 'difficulty-onboarding' && (
          <motion.div
            key="difficulty-onboarding"
            className="min-h-[100dvh]"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={viewTransition}
          >
            <DifficultyPicker
              studentName={userName}
              onComplete={handleDifficultyComplete}
              onBack={() => setView('plan')}
            />
          </motion.div>
        )}
        {view === 'home' && (
          <motion.div
            key="home"
            className="min-h-[100dvh]"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={viewTransition}
          >
            {userRole === 'student' && activeClassSession && (
              <>
                <SessionBanner
                  apiBase={apiBase}
                  studentName={userName}
                  onLeave={clearClassSession}
                />
                <div style={{ height: 38 }} aria-hidden />
              </>
            )}
            <HomeScreen
              role={userRole}
              userName={userName}
              isRobotConnected={state.robot_connected}
              classroomName={classroomName || undefined}
              studentCount={studentCount}
              apiBase={apiBase}
              forceSandboxView={sandboxModeRequested}
              onStartSession={handleStartSession}
              onSignOut={handleSignOut}
              onBackToMenu={() => { setSandboxModeRequested(false); setView('plan'); }}
              onClassroomSaved={handleClassroomSaved}
              onOpenTeacherDashboard={userRole === 'teacher' ? () => setShowTeacherDash(true) : undefined}
            />
            <AnimatePresence>
              {showTeacherDash && userRole === 'teacher' && (
                <TeacherDashboard
                  apiBase={apiBase}
                  classroomName={classroomName || 'My Class'}
                  teacherName={userName}
                  onClose={() => setShowTeacherDash(false)}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
        {view === 'session' && (
          <motion.div
            key="session"
            className="min-h-[100dvh]"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={viewTransition}
          >
            {userRole === 'student' && activeClassSession && (
              <>
                <SessionBanner
                  apiBase={apiBase}
                  studentName={userName}
                  onLeave={clearClassSession}
                />
                <div style={{ height: 38 }} aria-hidden />
              </>
            )}
            <StudentDashboard
      topStatus={topStatus}
      conceptId={selectedConceptId}
      conceptTitle={selectedConceptTitle}
      ageGroup={selectedAgeGroup}
      studentName={userName}
      apiBase={apiBase}
      userRole={userRole}
      sessionId={currentSessionId}
      appMode={lessonPlanActive ? 'classroom' : selectedConceptId ? 'tutor' : 'sandbox'}
      lessonPlanActive={lessonPlanActive}
      activeChallengeId={activeChallengeId}
      onChallengeComplete={() => setActiveChallengeId(null)}
      classroomRestrictions={userRole === 'student' ? classroomRestrictions : undefined}
      onConceptSelect={handleConceptSelect}
      onBackToHome={() => {
        setLessonPlanActive(false);
        setView('home');
      }}
      onChangeDifficulty={() => setShowDifficultyModal(true)}
      onRequestSignIn={() => { setAuthMode('personal'); setView('auth'); }}
      operatorMode={operator.mock_mode ? 'Practice mode' : 'Live mode'}
      nextActionTitle={nextActionTitle}
      nextActionCopy={nextActionCopy}
      cameraModeLabel={cameraModeLabel}
      cameraStatus={camera.latest_frame_label}
      cameraSourceStatus={camera.source_status}
      companionConnectionStatus={companionConnectionStatus}
      browserCameraStatus={browserCameraStatus}
      companionBackendUrl={companionBackendUrl}
      backendReachable={backendReachable}
      cameraReady={camera.online}
      canvasReady={canvas.detected}
      drawingReady={taskReady}
      robotReady={state.robot_connected}
      activeJobName={activeJob.name}
      prompt={prompt}
      composing={composing}
      uploading={uploading}
      featuredTasks={featuredTasks}
        overlayPreviewUrl={activePreviewUrl}
        liveCameraOverlayUrl={liveCameraOverlayUrl}
        liveMarkerOverlayUrl={liveMarkerOverlayUrl}
        overlayPreviewLabel={overlay.source_name ?? activeJob.name ?? 'Overlay preview'}
      cameraFrameUrl={cameraFrameUrl}
      browserCameraReady={browserCameraReady}
      phoneViewerReady={phoneViewerReady}
      cameraSource={camera.source}
      canvasDetected={canvas.detected}
      aprilTagCount={camera.april_tag_detections.length}
      aprilTagDetections={camera.april_tag_detections}
      canvasBorder={camera.canvas_border}
      videoRef={videoRef}
      onVideoMount={handleVideoMount}
      sourceSaving={sourceSaving}
      backendLinkCopied={backendLinkCopied}
      classroomJoinCode={classroomJoinCode}
      onActivateCompanionCamera={() => void activateCompanionCamera()}
      onActivateBrowserCamera={() => void activateBrowserCamera()}
      onDeactivateCamera={() => void deactivateCamera()}
      onCopyBackendUrl={() => void copyBackendUrl()}
      onPromptChange={setPrompt}
      onSubmitPrompt={(event) => void submitPrompt(event)}
      onUploadFile={(event) => void uploadFile(event)}
      onLoadTask={(task) => void loadTask(task)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top-right cluster: sound + theme + profile ──
          All three live in the SAME flex row so they share `align-items: center`
          and can't drift vertically relative to each other. The profile button
          is skipped on the auth screen (circular UX) and the plan picker
          (which renders its own contextual profile button). */}
      <div className="app-global-br-controls">
        <motion.button
          type="button"
          className="app-sound-btn"
          onClick={toggleMute}
          title={muted ? 'Unmute music' : 'Mute music'}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </motion.button>
        <ThemeToggle variant="icon" />
        {view !== 'auth' && (() => {
          const showAvatar = userRole !== 'guest' && profileAvatar;
          const cls = `app-profile-btn${userRole === 'guest' ? ' is-guest' : ''}`;
          return (
            // Plain motion.button with only hover/tap scaling — no entrance
            // spring — so the PFP behaves identically to its sound/theme
            // siblings in the same flex row. Anything that animates differently
            // can shift the flex baseline mid-mount.
            <motion.button
              type="button"
              className={cls}
              onClick={() => userRole === 'guest' ? setView('plan') : setAccountPanelOpen(true)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              title={userRole === 'guest' ? 'Sign in' : 'Account'}
            >
              {showAvatar
                ? <StudentProfileAvatar kind={profileAvatar.kind} emoji={profileAvatar.emoji} robotPresetId={profileAvatar.robotPreset} accent={profileAvatar.color} size={20} />
                : <UserRound size={16} />
              }
            </motion.button>
          );
        })()}
      </div>

      <AnimatePresence>
        {accountPanelOpen && (
          <UserAccountPanel
            role={userRole}
            name={userName}
            email={userEmail || undefined}
            onSignOut={() => { setAccountPanelOpen(false); handleSignOut(); }}
            onClose={() => setAccountPanelOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Difficulty re-assessment modal — accessible from the level dropdown in any session */}
      <AnimatePresence>
        {showDifficultyModal && (
          <motion.div
            key="difficulty-modal"
            style={{ position: 'fixed', inset: 0, zIndex: 300 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <DifficultyPicker
              studentName={userName}
              onComplete={handleDifficultyComplete}
            />
            <button
              type="button"
              onClick={() => setShowDifficultyModal(false)}
              style={{
                position: 'absolute', top: 18, right: 20, zIndex: 10,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 8, padding: '6px 12px', color: 'var(--muted)',
                fontSize: '0.8rem', cursor: 'pointer',
              }}
            >
              ✕ Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </GuidedTourProvider>
  );
}
