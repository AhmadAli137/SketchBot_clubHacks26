'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { mockState } from '@/lib/mock-state';
import type { AppState, TaskRecord } from '@/lib/types';

const browserHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const browserProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const wsProtocol = browserProtocol === 'https:' ? 'wss:' : 'ws:';
const isLocalBrowserHost = browserHost === 'localhost' || browserHost === '127.0.0.1';
const backendHost = process.env.NEXT_PUBLIC_BACKEND_HOST ?? (isLocalBrowserHost ? `${browserHost}:8000` : browserHost);
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? `${browserProtocol}//${backendHost}`;
const WS_BASE = process.env.NEXT_PUBLIC_BACKEND_WS ?? `${wsProtocol}//${backendHost}/ws/state`;

export default function HomePage() {
  const [state, setState] = useState<AppState>(mockState);
  const [backendReachable, setBackendReachable] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'create'>('dashboard');
  const [webrtcReady, setWebrtcReady] = useState(false);
  const [webrtcFailed, setWebrtcFailed] = useState(false);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [prompt, setPrompt] = useState('simple smiley face');
  const [uploading, setUploading] = useState(false);
  const [composing, setComposing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadState = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/state`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch state');
        const nextState = (await response.json()) as AppState;
        if (!cancelled) {
          setState(nextState);
          setBackendReachable(true);
        }
      } catch {
        if (!cancelled) setBackendReachable(false);
      }
    };

    const loadTasks = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/compose/tasks`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch tasks');
        const payload = (await response.json()) as { tasks: TaskRecord[] };
        if (!cancelled) setTasks(payload.tasks ?? []);
      } catch {
        if (!cancelled) setTasks([]);
      }
    };

    loadState();
    loadTasks();

    const ws = new WebSocket(WS_BASE);
    ws.onmessage = (event) => {
      try {
        const nextState = JSON.parse(event.data) as AppState;
        if (!cancelled) {
          setState(nextState);
          setBackendReachable(true);
        }
      } catch {
        // ignore invalid snapshots
      }
    };
    ws.onerror = () => {
      if (!cancelled) setBackendReachable(false);
    };

    return () => {
      cancelled = true;
      ws.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const startWebRTC = async () => {
      try {
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        pc.ontrack = (event) => {
          const [stream] = event.streams;
          if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
            setWebrtcReady(true);
            setWebrtcFailed(false);
          }
        };

        const offer = await pc.createOffer({ offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);

        const response = await fetch(`${API_BASE}/api/webrtc/offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
        });
        if (!response.ok) throw new Error('WebRTC offer failed');

        const answer = await response.json();
        if (cancelled) return;
        await pc.setRemoteDescription(answer);
      } catch {
        if (!cancelled) {
          setWebrtcFailed(true);
          setWebrtcReady(false);
        }
      }
    };

    startWebRTC();

    return () => {
      cancelled = true;
      const pc = pcRef.current;
      if (pc) {
        pc.close();
        pcRef.current = null;
      }
    };
  }, []);

  const refreshTasks = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/compose/tasks`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const payload = (await response.json()) as { tasks: TaskRecord[] };
      setTasks(payload.tasks ?? []);
    } catch {
      // ignore
    }
  };

  const submitPrompt = async (event: FormEvent) => {
    event.preventDefault();
    setComposing(true);
    try {
      await fetch(`${API_BASE}/api/compose/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      await refreshTasks();
      setPrompt('');
      setActiveTab('dashboard');
    } finally {
      setComposing(false);
    }
  };

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      await refreshTasks();
      setActiveTab('dashboard');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const loadTask = async (task: TaskRecord) => {
    if (task.source_type === 'prompt' && task.prompt) {
      await fetch(`${API_BASE}/api/compose/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: task.prompt }),
      });
      setActiveTab('dashboard');
      return;
    }
  };

  const activeJob = state.active_job ?? { id: null, name: null, status: 'idle', source_type: null, path_count: 0, prompt: null };
  const camera = state.camera ?? {
    online: false,
    source: 'unavailable',
    latest_frame_label: 'No camera frame',
    latest_frame_url: null,
    april_tag_detections: [],
    canvas_border: { corners: [], source_tag_ids: [], detected: false },
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
  const robotPose = state.robot_pose ?? { x_mm: 0, y_mm: 0, heading_deg: 0, pen_down: false };
  const operator = state.operator ?? { status_text: 'Connecting to backend', last_action: 'Waiting for operator', mock_mode: false, connection_mode: 'live' };
  const recentEvents = state.recent_events ?? [];
  const taskReady = activeJob.status === 'draft' || activeJob.status === 'planned' || activeJob.status === 'ready';
  const cameraFrameUrl = `${API_BASE}/api/camera/stream`;
  const robotLeft = `${Math.max(10, Math.min(90, (robotPose.x_mm / Math.max(canvas.width_mm || 1, 1)) * 100))}%`;
  const robotTop = `${Math.max(10, Math.min(90, (robotPose.y_mm / Math.max(canvas.height_mm || 1, 1)) * 100))}%`;
  const aprilTagDetections = camera.april_tag_detections ?? [];
  const canvasBorder = camera.canvas_border ?? { corners: [], source_tag_ids: [], detected: false };
  const robotTag = aprilTagDetections.find((tag) => tag.tag_id === 4) ?? null;

  const topStatus = useMemo(() => {
    return [
      { label: 'Pi', value: backendReachable ? 'Online' : 'Offline' },
      { label: 'Camera', value: state.camera.online ? 'Live' : 'Offline' },
      { label: 'Robot', value: state.robot_connected ? state.robot_status : 'Disconnected' },
    ];
  }, [backendReachable, camera.online, state.robot_connected, state.robot_status]);

  return (
    <main className="app-shell">
      <div className="top-bar compact-top-bar">
        <div>
          <p className="eyebrow">SketchBot operator UI</p>
          <h1>Operator Dashboard</h1>
          <p className="subdued-text">Live camera supervision, task prep, and robot status in one place.</p>
        </div>
        <div className="status-pills">
          {topStatus.map((item) => (
            <span key={item.label} className="status-pill">{item.label}: {item.value}</span>
          ))}
          <span className="mode-pill">{operator.mock_mode ? 'Mock' : 'Live'}</span>
        </div>
      </div>

      <div className="tab-row">
        <button className={activeTab === 'dashboard' ? 'tab active' : 'tab'} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
        <button className={activeTab === 'create' ? 'tab active' : 'tab'} onClick={() => setActiveTab('create')}>Create Task</button>
      </div>

      {activeTab === 'dashboard' ? (
        <section className="grid-main dashboard-layout">
          <div className="side-stack">
            <div className="panel" style={{ display: 'grid', gap: 10 }}>
              <div className="section-header-row" style={{ flexWrap: 'wrap' }}>
                <div>
                  <p className="panel-eyebrow">Live camera</p>
                  <div className="panel-title" style={{ fontSize: '1.2rem' }}>Robot workspace</div>
                </div>
                <div className="status-pills">
                  <span className="section-badge">Source: {camera.source}</span>
                  <span className="section-badge">{camera.latest_frame_label}</span>
                  {robotTag ? <span className="section-badge">Heading: {robotPose.heading_deg.toFixed(1)}°</span> : null}
                </div>
              </div>

              <div className="workspace-card" style={{ minHeight: 460 }}>
                <div className="workspace-stage">
                  <div className="canvas-frame">
                    {webrtcReady ? (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#050b16' }}
                      />
                    ) : cameraFrameUrl && !webrtcFailed ? (
                      <img
                        src={cameraFrameUrl}
                        alt={camera.latest_frame_label ?? 'Camera stream'}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#050b16' }}
                      />
                    ) : (
                      <div style={{ position: 'absolute', inset: 0, background: '#050b16', display: 'grid', placeItems: 'center', color: 'rgba(223,246,255,0.8)', fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        No camera frame available
                      </div>
                    )}

                    {canvasBorder.detected && (overlay.svg_path || overlay.image_data_url) ? (
                      <img
                        src={`${API_BASE}/api/camera/overlay-preview`}
                        alt={overlay.source_name ?? 'Overlay asset'}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          opacity: 0.6,
                          pointerEvents: 'none',
                        }}
                      />
                    ) : null}

                    {aprilTagDetections.map((tag) => {
                      const left = `${tag.center.x * 100}%`;
                      const top = `${tag.center.y * 100}%`;
                      const polygonPoints = tag.corners.map((corner) => `${corner.x * 100},${corner.y * 100}`).join(' ');
                      const isRobotTag = tag.tag_id === 4;
                      return (
                        <div key={tag.tag_id}>
                          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                            <polygon points={polygonPoints} fill={isRobotTag ? 'rgba(255,64,64,0.10)' : 'rgba(93,228,255,0.10)'} stroke={isRobotTag ? 'rgba(255,64,64,0.95)' : 'rgba(93,228,255,0.95)'} strokeWidth="0.45" />
                          </svg>
                          <div className="tag-pill" style={{ left, top, transform: 'translate(-50%, -50%)', position: 'absolute' }}>
                            Tag {tag.tag_id}
                          </div>
                          {isRobotTag ? (
                            <>
                              <div style={{ position: 'absolute', left, top, width: 12, height: 12, borderRadius: '999px', background: '#ff3b30', boxShadow: '0 0 18px rgba(255,59,48,0.85)', transform: 'translate(-50%, -50%)' }} />
                              <div style={{ position: 'absolute', left: `calc(${left} + 12px)`, top: `calc(${top} - 22px)`, color: '#ffd2d0', fontSize: 12, fontWeight: 700, textShadow: '0 0 12px rgba(0,0,0,0.75)' }}>
                                {robotPose.heading_deg.toFixed(1)}°
                              </div>
                            </>
                          ) : null}
                        </div>
                      );
                    })}

                    {(canvasBorder.detected || taskReady) ? (
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                        {canvasBorder.detected ? (
                          <polygon
                            points={canvasBorder.corners.map((corner) => `${corner.x * 100},${corner.y * 100}`).join(' ')}
                            fill="rgba(77,226,255,0.06)"
                            stroke="rgba(77,226,255,0.95)"
                            strokeWidth="0.7"
                          />
                        ) : null}
                        {taskReady && !overlay.svg_path && !overlay.image_data_url ? (
                          <>
                            <polyline fill="none" stroke="rgba(255,79,216,0.65)" strokeWidth="0.55" strokeDasharray="2 2" points="14,30 20,30 20,18 31,18 31,44 44,44 44,22 56,22" />
                            <polyline fill="none" stroke="rgba(93,228,255,0.95)" strokeWidth="0.9" points="18,25 28,25 28,40 40,40 40,28 52,28 52,45 64,45 64,32 78,32" />
                          </>
                        ) : null}
                      </svg>
                    ) : null}

                    {taskReady ? (
                      <div className="robot-dot" style={{ left: robotLeft, top: robotTop }}>
                        <div className="robot-heading" style={{ transform: `translate(-50%, -92%) rotate(${robotPose.heading_deg}deg)` }} />
                        <div className="pen-dot" />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid-2">
              <div className="panel">
                <h3>Active Task</h3>
                <ul className="compact-list">
                  <li>Name: {activeJob.name ?? 'No active task'}</li>
                  <li>State: {activeJob.status}</li>
                  <li>Source: {activeJob.source_type ?? '—'}</li>
                  <li>Paths: {activeJob.path_count}</li>
                  <li>Overlay: {overlay.source_name ?? 'None'}</li>
                </ul>
              </div>
              <div className="panel">
                <h3>Robot Status</h3>
                <ul className="compact-list">
                  <li>Heading: {robotPose.heading_deg.toFixed(1)}°</li>
                  <li>Position: {robotPose.x_mm.toFixed(1)}, {robotPose.y_mm.toFixed(1)} mm</li>
                  <li>Pen: {robotPose.pen_down ? 'down' : 'up'}</li>
                  <li>Robot: {state.robot_connected ? state.robot_status : 'disconnected'}</li>
                </ul>
              </div>
            </div>
          </div>

          <aside className="side-stack">
            <div className="panel">
              <h3>Live View</h3>
              <ul className="compact-list">
                <li>Backend: {backendReachable ? 'reachable' : 'unreachable'}</li>
                <li>Camera: {camera.source} · {camera.latest_frame_label}</li>
                <li>Canvas detected: {canvas.detected ? 'yes' : 'no'}</li>
                <li>Localization: {Math.round(state.localization_confidence * 100)}%</li>
                <li>Mode: {operator.mock_mode ? 'mock' : 'live'}</li>
              </ul>
            </div>

            <div className="panel">
              <h3>Recent Activity</h3>
              <ul className="compact-list">
                {recentEvents.slice(0, 5).map((event, index) => (
                  <li key={`${index}-${event}`}>{event}</li>
                ))}
              </ul>
            </div>
          </aside>
        </section>
      ) : (
        <section className="grid-main dashboard-layout">
          <div className="side-stack">
            <div className="panel">
              <h2>Create Task</h2>
              <p className="subdued-text" style={{ marginBottom: 16 }}>Type a prompt or upload a black-and-white SVG/image. Finished tasks should immediately feel like overlays, not a separate workflow.</p>

              <form onSubmit={submitPrompt} style={{ display: 'grid', gap: 12 }}>
                <label className="block text-sm">
                  <span className="mb-2 block text-[var(--muted)]">Prompt</span>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="simple house outline" className="w-full rounded-2xl border border-[rgba(120,140,255,0.16)] bg-[rgba(5,8,22,0.8)] px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/40 focus:shadow-[0_0_0_4px_rgba(77,226,255,0.08)]" />
                </label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button className="tab active" type="submit" disabled={composing || !prompt.trim()}>{composing ? 'Generating…' : 'Generate overlay'}</button>
                  <label className="tab" style={{ cursor: uploading ? 'progress' : 'pointer' }}>
                    {uploading ? 'Uploading…' : 'Upload SVG / image'}
                    <input type="file" accept=".svg,image/*" onChange={uploadFile} style={{ display: 'none' }} />
                  </label>
                </div>
              </form>
            </div>
          </div>

          <aside className="side-stack">
            <div className="panel">
              <h3>Saved items</h3>
              <ul className="compact-list">
                {tasks.length === 0 ? <li>No saved items yet.</li> : tasks.slice(0, 8).map((task) => (
                  <li key={task.id} style={{ display: 'grid', gap: 6 }}>
                    <strong>{task.name}</strong>
                    <span>{task.source_type}</span>
                    {task.prompt ? <span>{task.prompt}</span> : null}
                    <button className="tab" onClick={() => loadTask(task)}>Load into dashboard</button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}
