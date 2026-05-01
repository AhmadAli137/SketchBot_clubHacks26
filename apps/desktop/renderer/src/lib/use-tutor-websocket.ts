'use client';

/**
 * useTutorWebSocket — long-lived connection to the persistent TutorAgent.
 *
 * Handles:
 *  • connection lifecycle (open, hello handshake, close, reconnect)
 *  • auth token injection in the hello payload (WS can't set headers)
 *  • exponential reconnection backoff with jitter
 *  • visibility-aware behaviour (pause reconnects while tab is hidden)
 *  • graceful drain handling (server sends `restart` → reconnect after delay)
 *  • bus bridge: every spark-event auto-forwards to the server
 *
 * Phase 1 scope: pure plumbing. The hook's `onMessage` callback delivers
 * server messages to the host component, which is responsible for UI
 * updates. We don't yet replace the /api/tutor/observe poll — that's
 * Phase 2.
 */

import { useEffect, useRef, useState } from 'react';

import { CLOUD_API_URL } from '@/lib/cloud-api';
import { onSparkEvent } from '@/lib/spark-events';
import {
  MSG_EVENT,
  MSG_HELLO,
  MSG_PING,
  MSG_RESTART,
  MSG_WELCOME,
  isServerMessage,
  type ClientMessage,
  type ServerMessage,
} from '@/lib/tutor-ws-protocol';

// ─── Tuning constants ───────────────────────────────────────────────────────

const RECONNECT_INITIAL_MS = 1_000;     // first retry: 1s
const RECONNECT_MAX_MS = 15_000;        // cap at 15s
const RECONNECT_JITTER_RATIO = 0.25;    // ±25% jitter
const PING_INTERVAL_MS = 25_000;        // align with server heartbeat
const HELLO_TIMEOUT_MS = 7_000;         // give up if no `welcome` after 7s

// ─── Public API ──────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'idle'         // not yet started or disabled
  | 'connecting'   // WS opening, hello inflight
  | 'open'         // welcome received; ready to send events
  | 'draining'     // server sent restart; backing off then will reconnect
  | 'closed'       // closed by us / final
  | 'error';       // some persistent error blocked us

export interface UseTutorWebSocketOptions {
  enabled: boolean;
  cloudAuthToken: string | null | undefined;
  sessionId: string | null;
  studentName: string;
  ageGroup: string;
  actorRole: 'student' | 'teacher';
  conceptId: string | null;
  layer: string;
  /** Called on every server message after type-guard validation. */
  onMessage: (msg: ServerMessage) => void;
}

export interface TutorWsHandle {
  status: ConnectionStatus;
  agentId: string | null;
  /** Returns true when the message was queued/sent; false when the
   *  connection isn't ready (caller may want to drop or buffer). */
  send: (msg: ClientMessage) => boolean;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export function useTutorWebSocket(opts: UseTutorWebSocketOptions): TutorWsHandle {
  // Latest opts in a ref so the connection lifecycle effect doesn't
  // re-run whenever student typing or scene state changes. We only
  // truly need to restart on enable/disable + identity change.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [agentId, setAgentId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sendRef = useRef<((msg: ClientMessage) => boolean) | null>(null);

  useEffect(() => {
    if (!opts.enabled || !opts.sessionId || !opts.studentName) {
      setStatus('idle');
      return;
    }
    if (opts.cloudAuthToken === undefined) {
      // Auth still resolving — wait quietly. Effect re-runs when token
      // transitions to string|null.
      return;
    }
    if (typeof window === 'undefined' || !CLOUD_API_URL) return;

    let cancelled = false;
    let attempt = 0;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let helloTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const wsUrl = httpToWs(CLOUD_API_URL) + '/ws/tutor';

    const cleanupTimers = () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (helloTimer) { clearTimeout(helloTimer); helloTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    const connect = () => {
      if (cancelled) return;
      const o = optsRef.current;
      if (!o.cloudAuthToken) {
        // Guest user — no point connecting; the server requires auth.
        setStatus('idle');
        return;
      }

      setStatus('connecting');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled || ws !== wsRef.current) return;
        // Send hello immediately. Server must respond with `welcome`
        // within HELLO_TIMEOUT_MS or we treat it as a failed handshake.
        const hello: ClientMessage = {
          type: MSG_HELLO,
          token: o.cloudAuthToken!,
          session_id: o.sessionId!,
          student_name: o.studentName,
          age_group: o.ageGroup,
          actor_role: o.actorRole,
          concept_id: o.conceptId,
          layer: o.layer,
        };
        ws.send(JSON.stringify(hello));

        helloTimer = setTimeout(() => {
          if (ws === wsRef.current && ws.readyState === WebSocket.OPEN) {
            try { ws.close(4408, 'hello-timeout'); } catch { /* noop */ }
          }
        }, HELLO_TIMEOUT_MS);
      };

      ws.onmessage = (ev) => {
        if (cancelled || ws !== wsRef.current) return;
        let parsed: unknown;
        try { parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); }
        catch { return; }
        if (!isServerMessage(parsed)) return;

        // Lifecycle handling first — welcome/restart/error change our
        // own state; everything else passes through to the host.
        if (parsed.type === MSG_WELCOME) {
          if (helloTimer) { clearTimeout(helloTimer); helloTimer = null; }
          setStatus('open');
          setAgentId(parsed.agent_id);
          attempt = 0;
          // Start client-side ping so the server's idle-timeout never trips.
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try { ws.send(JSON.stringify({ type: MSG_PING })); }
              catch { /* dropped; close will follow naturally */ }
            }
          }, PING_INTERVAL_MS);
        } else if (parsed.type === MSG_RESTART) {
          // Server is draining (deploy). Schedule a reconnect after the
          // hint and stop the current connection cleanly.
          setStatus('draining');
          const wait = Math.max(2_000, parsed.reconnect_in_ms ?? 5_000);
          try { ws.close(1000, 'server-restart'); } catch { /* noop */ }
          reconnectTimer = setTimeout(connect, wait + jitter(wait));
          return;
        }

        // Forward to host handler
        try {
          optsRef.current.onMessage(parsed);
        } catch (err) {
          console.error('[tutor-ws] onMessage handler threw', err);
        }
      };

      ws.onerror = () => {
        // Don't change state here — let onclose handle the transition so
        // we don't double-fire reconnect logic.
      };

      ws.onclose = (ev) => {
        cleanupTimers();
        if (cancelled || ws !== wsRef.current) return;

        wsRef.current = null;
        setAgentId(null);

        // Codes 4xxx in our protocol are deliberate auth/capacity errors —
        // don't keep retrying them in a hot loop.
        if (ev.code === 4401) {
          setStatus('error');
          return;
        }
        if (ev.code === 4503) {
          // Capacity. Try again after a longer delay.
          attempt = Math.max(attempt, 5);
        }

        // Schedule a reconnect with backoff. If we're in `draining`
        // state already, the explicit reconnectTimer set above wins.
        if (reconnectTimer === null) {
          attempt += 1;
          const base = Math.min(
            RECONNECT_MAX_MS,
            RECONNECT_INITIAL_MS * Math.pow(2, Math.min(attempt - 1, 6)),
          );
          const wait = base + jitter(base);
          setStatus('connecting');
          reconnectTimer = setTimeout(connect, wait);
        }
      };
    };

    // Public send: returns false if the socket isn't open.
    sendRef.current = (msg: ClientMessage) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try {
        ws.send(JSON.stringify(msg));
        return true;
      } catch {
        return false;
      }
    };

    // Bus bridge — every spark-event auto-forwards to the server. The
    // agent uses this stream to do its multi-event reasoning. We strip
    // events the agent doesn't need (its own nudges, internal lifecycle).
    const SKIP_KINDS = new Set<string>([
      'spark.nudge.idle', 'spark.nudge.struggle',
      'spark.observe.start', 'spark.observe.end',
    ]);
    const unsubBus = onSparkEvent((detail) => {
      if (SKIP_KINDS.has(detail.kind)) return;
      const send = sendRef.current;
      if (!send) return;
      send({
        type: MSG_EVENT,
        kind: detail.kind,
        payload: detail.payload,
        ts: detail.ts,
      });
    });

    connect();

    return () => {
      cancelled = true;
      cleanupTimers();
      unsubBus();
      const ws = wsRef.current;
      wsRef.current = null;
      sendRef.current = null;
      if (ws) {
        try { ws.close(1000, 'effect-cleanup'); } catch { /* noop */ }
      }
      setStatus('closed');
      setAgentId(null);
    };
    // Identity-level deps only. Per-render details (chat, scene state)
    // flow through optsRef so we don't rebuild the connection on every
    // keystroke.
  }, [
    opts.enabled,
    opts.sessionId,
    opts.studentName,
    opts.cloudAuthToken,
    opts.ageGroup,
    opts.actorRole,
    opts.conceptId,
    opts.layer,
  ]);

  return {
    status,
    agentId,
    send: (msg: ClientMessage) => {
      const fn = sendRef.current;
      return fn ? fn(msg) : false;
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function httpToWs(url: string): string {
  if (url.startsWith('https://')) return 'wss://' + url.slice(8);
  if (url.startsWith('http://')) return 'ws://' + url.slice(7);
  return url;
}

function jitter(ms: number): number {
  const range = ms * RECONNECT_JITTER_RATIO;
  return (Math.random() * 2 - 1) * range;
}
