'use client';

/**
 * One-tap robot pairing orchestration.
 *
 * Strings together the existing endpoints (Phase 2b → 2c.2) into a single
 * call so the desktop UI can present pairing as a single button instead
 * of the 7-step process a kid would otherwise hit. Steps:
 *
 *   1. Claim the serial on the cloud:        POST /api/devices
 *   2. Mint a per-device JWT for the bot:    POST /api/devices/{id}/token
 *   3. Push credentials down the LAN WS:     POST /api/robot/raw (set_credentials)
 *
 * After step 3 the firmware persists ws_url + token in NVS and, on its
 * next reconnect, talks directly to the cloud's /ws/robot — no desktop
 * required for kid-side use.
 *
 * Failure semantics:
 *   - Step 1 fail (409): another account owns this serial. Caller surfaces
 *     a "ask the previous owner to release it" message.
 *   - Step 2 fail: cloud is missing DEVICE_JWT_SECRET. Caller surfaces a
 *     "support" message.
 *   - Step 3 fail: bot is claimed but not provisioned. Recoverable — the
 *     caller can re-run pairing without re-claiming.
 *
 * Callbacks report progress so the UI can step through visible states
 * rather than blocking on a single spinner.
 */

import { CLOUD_API_URL, cloudHeaders } from './cloud-api';

export type PairStep =
  | 'idle'
  | 'claiming'
  | 'issuing-token'
  | 'provisioning'
  | 'success'
  | 'error';

export type PairFailureReason =
  | 'not-signed-in'
  | 'already-claimed'
  | 'token-not-configured'
  | 'firmware-offline'
  | 'network'
  | 'unknown';

export type PairResult =
  | { ok: true; deviceId: string; serial: string; expiresAt: string }
  | { ok: false; reason: PairFailureReason; step: PairStep; message: string };

type PairOptions = {
  /** Localhost runtime base (e.g. http://127.0.0.1:8787). */
  localApiBase: string;
  /** Supabase access token of the signed-in user. */
  authToken: string | null | undefined;
  /** Serial the firmware sent on hello, e.g. SKETCH-A1B2-C3D4. */
  serial: string;
  /** Friendly nickname stored on the device row. Optional. */
  name?: string;
  /** Fired before each step transition so the UI can animate. */
  onProgress?: (step: PairStep) => void;
};

/**
 * Derive the cloud's /ws/robot URL from the configured HTTP base.
 * This is what the firmware persists in NVS and uses on its next boot.
 */
function cloudRobotWsUrl(): string {
  const u = new URL(CLOUD_API_URL);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/ws/robot';
  u.search = '';
  return u.toString();
}

export async function pairRobot(opts: PairOptions): Promise<PairResult> {
  const { localApiBase, authToken, serial, name, onProgress } = opts;
  const report = (step: PairStep) => onProgress?.(step);

  if (!authToken) {
    report('error');
    return {
      ok: false,
      reason: 'not-signed-in',
      step: 'idle',
      message: 'Sign in to your SaySpark account first.',
    };
  }

  // ── Step 1: claim the serial ────────────────────────────────────────
  report('claiming');
  let deviceId: string;
  try {
    const res = await fetch(`${CLOUD_API_URL}/api/devices`, {
      method: 'POST',
      headers: cloudHeaders(authToken),
      body: JSON.stringify({ serial, name: name ?? null }),
    });

    if (res.status === 409) {
      return {
        ok: false,
        reason: 'already-claimed',
        step: 'claiming',
        message: 'This robot is already registered to another SaySpark account. Ask the previous owner to release it.',
      };
    }
    if (!res.ok) {
      const body = await safeJson(res);
      return {
        ok: false,
        reason: 'network',
        step: 'claiming',
        message: body?.detail ?? `Couldn't claim the robot (HTTP ${res.status}).`,
      };
    }
    const body = (await res.json()) as { id: string };
    deviceId = body.id;
  } catch (err) {
    return {
      ok: false,
      reason: 'network',
      step: 'claiming',
      message: friendlyErr(err, "Couldn't reach the cloud to claim the robot."),
    };
  }

  // ── Step 2: mint a fresh JWT ────────────────────────────────────────
  report('issuing-token');
  let token: string;
  let expiresAt: string;
  try {
    const res = await fetch(`${CLOUD_API_URL}/api/devices/${deviceId}/token`, {
      method: 'POST',
      headers: cloudHeaders(authToken),
    });

    if (res.status === 503) {
      // Server hasn't been configured with DEVICE_JWT_SECRET — surfaced
      // by the issue endpoint when secret_configured() is false. The
      // user can't fix this themselves; route them to support.
      return {
        ok: false,
        reason: 'token-not-configured',
        step: 'issuing-token',
        message: "The cloud isn't set up to issue robot tokens yet. Please contact support.",
      };
    }
    if (!res.ok) {
      const body = await safeJson(res);
      return {
        ok: false,
        reason: 'network',
        step: 'issuing-token',
        message: body?.detail ?? `Couldn't get a token (HTTP ${res.status}).`,
      };
    }
    const body = (await res.json()) as { token: string; expires_at: string };
    token = body.token;
    expiresAt = body.expires_at;
  } catch (err) {
    return {
      ok: false,
      reason: 'network',
      step: 'issuing-token',
      message: friendlyErr(err, "Couldn't reach the cloud to mint a token."),
    };
  }

  // ── Step 3: push set_credentials to firmware via LAN ────────────────
  report('provisioning');
  try {
    const res = await fetch(`${localApiBase}/api/robot/raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'set_credentials',
        args: { ws_url: cloudRobotWsUrl(), token },
        wait: true,
        timeout_s: 3,
      }),
    });

    if (res.status === 503) {
      // robot_ws_service reports the bot isn't on the LAN. Common case:
      // bot got reset mid-pair. The claim + token succeeded — caller
      // can offer a 'retry provisioning' without re-claiming.
      return {
        ok: false,
        reason: 'firmware-offline',
        step: 'provisioning',
        message: "Your robot disconnected before we could finish. Reset it and try again — your account already owns it.",
      };
    }
    if (!res.ok) {
      const body = await safeJson(res);
      return {
        ok: false,
        reason: 'network',
        step: 'provisioning',
        message: body?.detail ?? `Couldn't reach the robot (HTTP ${res.status}).`,
      };
    }
    const body = (await res.json()) as { result?: { ok?: boolean; message?: string } };
    if (body.result && body.result.ok === false) {
      return {
        ok: false,
        reason: 'network',
        step: 'provisioning',
        message: body.result.message ?? 'The robot refused the credentials.',
      };
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'network',
      step: 'provisioning',
      message: friendlyErr(err, "Couldn't reach the local runtime to provision your robot."),
    };
  }

  report('success');
  return { ok: true, deviceId, serial, expiresAt };
}

// ─── helpers ────────────────────────────────────────────────────────────────
async function safeJson(res: Response): Promise<{ detail?: string } | null> {
  try { return (await res.json()) as { detail?: string }; } catch { return null; }
}

function friendlyErr(err: unknown, fallback: string): string {
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return 'Network error — check your internet connection.';
  }
  return fallback;
}
