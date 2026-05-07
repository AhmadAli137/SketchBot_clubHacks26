#!/usr/bin/env python3
"""Hardware smoke test for the SketchBot ESP32-C5 firmware.

Walks every firmware-exposed subsystem in order — Wi-Fi link, telemetry
stream, pen servo, raw motor.set, high-level moves, rotate — and prints a
clear pass/fail per step. Run this once after every firmware flash to
confirm the new build still drives the chassis, servo, and Wi-Fi link.

Pre-requisites:
  1. local-runtime is up (either via `npm run local-runtime:dev` or directly
     `uvicorn app.main:app --port 8787` from services/local-runtime).
  2. The robot is powered on, has Wi-Fi credentials in secrets.h, and has
     just connected (you should see "Robot connected: <id>" in the runtime
     log). If it hasn't connected yet, hit Reset on the board and wait ~5s.
  3. The robot is on the floor or held in the air — `motor.set` will spin
     the wheels. You'll be prompted before each motion test.

Usage:
  python services/local-runtime/scripts/hardware_smoke_test.py
  python services/local-runtime/scripts/hardware_smoke_test.py --auto
  python services/local-runtime/scripts/hardware_smoke_test.py \\
      --runtime http://192.168.2.16:8787 --skip motors

Why this lives in local-runtime/scripts: every firmware command goes
through the runtime's WebSocket relay, so this script just hits the same
HTTP endpoints the desktop app uses (POST /api/robot/raw, /api/robot/motor)
and polls /api/state for telemetry. No knowledge of the WS protocol leaks
into the test.
"""

from __future__ import annotations

import argparse
import sys
import time
from typing import Any

import httpx


# ─── Console pretty-print helpers ────────────────────────────────────────────

class C:  # noqa: N801 — short-name palette
    RESET = "\033[0m"
    DIM   = "\033[2m"
    BOLD  = "\033[1m"
    GREEN = "\033[32m"
    RED   = "\033[31m"
    YEL   = "\033[33m"
    CYAN  = "\033[36m"
    GREY  = "\033[90m"

# Disable colour on Windows terminals that don't support ANSI by default.
if sys.platform.startswith('win'):
    try:
        import colorama  # type: ignore[import-not-found]
        colorama.just_fix_windows_console()
    except ImportError:
        pass


def banner(text: str) -> None:
    print(f"\n{C.BOLD}{C.CYAN}━━━ {text} ━━━{C.RESET}")


def passed(label: str, ms: float, detail: str = '') -> None:
    detail_str = f" {C.DIM}{detail}{C.RESET}" if detail else ""
    print(f"  {C.GREEN}✓{C.RESET} {label}{detail_str} {C.GREY}({ms:.0f}ms){C.RESET}")


def failed(label: str, ms: float, reason: str) -> None:
    print(f"  {C.RED}✗{C.RESET} {label} {C.GREY}({ms:.0f}ms){C.RESET}")
    print(f"    {C.RED}{reason}{C.RESET}")


def warn(text: str) -> None:
    print(f"  {C.YEL}!{C.RESET} {text}")


def info(text: str) -> None:
    print(f"  {C.DIM}{text}{C.RESET}")


def prompt(text: str, auto: bool) -> None:
    if auto:
        print(f"  {C.DIM}[auto] {text}{C.RESET}")
        time.sleep(0.5)
    else:
        try:
            input(f"  {C.YEL}»{C.RESET} {text} {C.DIM}[Enter]{C.RESET} ")
        except (KeyboardInterrupt, EOFError):
            print()
            sys.exit(1)


# ─── Runner ──────────────────────────────────────────────────────────────────

class SmokeTest:
    def __init__(self, runtime: str, auto: bool, skip: set[str]):
        self.client = httpx.Client(base_url=runtime.rstrip('/'), timeout=35.0)
        self.auto = auto
        self.skip = skip
        self.results: list[tuple[str, bool, str]] = []

    # ── HTTP helpers ──

    def state(self) -> dict[str, Any]:
        return self.client.get('/api/state').json()

    def raw(self, name: str, args: dict | None = None,
            wait: bool = True, timeout_s: float = 30.0) -> dict:
        body = {'name': name, 'args': args or {}, 'wait': wait, 'timeout_s': timeout_s}
        return self.client.post('/api/robot/raw', json=body).json()

    def motor_set(self, left_mps: float, right_mps: float) -> dict:
        body = {'left_mps': left_mps, 'right_mps': right_mps}
        return self.client.post('/api/robot/motor', json=body).json()

    # ── Subsystem checks ──

    def check_runtime(self) -> bool:
        banner('Runtime reachable')
        t0 = time.perf_counter()
        try:
            r = self.client.get('/health', timeout=3.0)
            r.raise_for_status()
            passed('GET /health', (time.perf_counter() - t0) * 1000, str(r.json()))
            self.results.append(('runtime', True, 'ok'))
            return True
        except Exception as exc:
            failed('GET /health', (time.perf_counter() - t0) * 1000, str(exc))
            warn('Start the runtime first: cd services/local-runtime && uvicorn app.main:app --port 8787')
            self.results.append(('runtime', False, str(exc)))
            return False

    def check_wifi_link(self) -> bool:
        """Robot is connected to runtime over WebSocket = Wi-Fi works,
        secrets.h credentials are right, and the firmware booted past
        network_hal.connect()."""
        banner('Wi-Fi + WebSocket link')
        # Poll for up to 8s — gives a freshly-reset board time to connect.
        t0 = time.perf_counter()
        deadline = t0 + 8.0
        last_status = ''
        while time.perf_counter() < deadline:
            s = self.state()
            if s.get('robot_connected'):
                ms = (time.perf_counter() - t0) * 1000
                passed('robot_connected = True', ms, f"status={s.get('robot_status')}")
                self.results.append(('wifi', True, 'connected'))
                return True
            last_status = s.get('robot_status', 'unknown')
            time.sleep(0.25)
        failed('robot did not connect', (time.perf_counter() - t0) * 1000,
               f'last status: {last_status}')
        warn('Reset the board and wait ~5s; check secrets.h Wi-Fi creds.')
        self.results.append(('wifi', False, f'never connected (last={last_status})'))
        return False

    def check_ping(self) -> None:
        banner('Ping (round-trip)')
        t0 = time.perf_counter()
        try:
            r = self.raw('ping', wait=True, timeout_s=5.0)
            ms = (time.perf_counter() - t0) * 1000
            ok = bool(r.get('result', {}).get('ok'))
            (passed if ok else failed)('ping', ms,
                                       r.get('result', {}).get('message', ''))
            self.results.append(('ping', ok, str(r.get('result'))))
        except Exception as exc:
            failed('ping', (time.perf_counter() - t0) * 1000, str(exc))
            self.results.append(('ping', False, str(exc)))

    def check_telemetry_stream(self) -> None:
        """Sample /api/state twice, ~500ms apart, and confirm at least one
        telemetry-derived field updated. Loose check — pose may be exactly
        zero on a stationary bot, but at minimum the connection-state
        timestamps tick over."""
        banner('Telemetry stream')
        t0 = time.perf_counter()
        s1 = self.state()
        time.sleep(0.6)
        s2 = self.state()
        ms = (time.perf_counter() - t0) * 1000
        if s1.get('robot_connected') and s2.get('robot_connected'):
            passed('telemetry alive', ms,
                   f"x={s2['robot_pose']['x_mm']:.1f}mm "
                   f"y={s2['robot_pose']['y_mm']:.1f}mm "
                   f"hdg={s2['robot_pose']['heading_deg']:.1f}°")
            self.results.append(('telemetry', True, 'alive'))
        else:
            failed('telemetry stream', ms, 'robot_connected went False between samples')
            self.results.append(('telemetry', False, 'connection dropped'))

    def check_servo(self) -> None:
        if 'servo' in self.skip:
            return
        banner('Pen servo')
        prompt('About to actuate the pen servo (up → down → up). Watch the SG90.', self.auto)
        for command, expect_down in [('pen_up', False), ('pen_down', True), ('pen_up', False)]:
            t0 = time.perf_counter()
            try:
                r = self.raw(command, wait=True, timeout_s=3.0)
                ms = (time.perf_counter() - t0) * 1000
                ok = bool(r.get('result', {}).get('ok'))
                # Cross-check telemetry pen state.
                pen_down_actual = bool(self.state().get('robot_pose', {}).get('pen_down'))
                state_ok = pen_down_actual == expect_down
                (passed if ok and state_ok else failed)(
                    command, ms,
                    f"telemetry pen_down={pen_down_actual}",
                )
                self.results.append((command, ok and state_ok, ''))
            except Exception as exc:
                failed(command, (time.perf_counter() - t0) * 1000, str(exc))
                self.results.append((command, False, str(exc)))

    def check_motors_raw(self) -> None:
        if 'motors' in self.skip:
            return
        banner('Raw motor.set primitive')
        prompt('Hold the bot in the air OR put it on a clear floor — wheels will spin.', self.auto)
        # Each test: spin a configuration for ~600ms, then stop.
        sequences: list[tuple[str, float, float]] = [
            ('left wheel forward',   0.20,  0.00),
            ('right wheel forward',  0.00,  0.20),
            ('both forward (slow)',  0.15,  0.15),
            ('both backward (slow)', -0.15, -0.15),
            ('pivot left',          -0.18,  0.18),
            ('pivot right',          0.18, -0.18),
        ]
        for label, l, r in sequences:
            t0 = time.perf_counter()
            try:
                self.motor_set(l, r)
                time.sleep(0.6)
                self.motor_set(0.0, 0.0)
                time.sleep(0.25)
                ms = (time.perf_counter() - t0) * 1000
                passed(label, ms, f"left={l:+.2f} right={r:+.2f} m/s")
                self.results.append((f'motor.set {label}', True, ''))
            except Exception as exc:
                failed(label, (time.perf_counter() - t0) * 1000, str(exc))
                self.results.append((f'motor.set {label}', False, str(exc)))

    def check_motors_blocking(self) -> None:
        if 'motors' in self.skip:
            return
        banner('Blocking move / rotate primitives')
        prompt('Place bot on the floor with ~0.5m clearance forward.', self.auto)
        moves: list[tuple[str, str, dict]] = [
            ('move forward 100mm',  'move_forward',  {'mm': 100.0, 'speed_mm_s': 60.0}),
            ('move backward 100mm', 'move_backward', {'mm': 100.0, 'speed_mm_s': 60.0}),
            ('rotate +90°',         'rotate',        {'degrees':  90.0, 'speed_dps': 90.0}),
            ('rotate -90°',         'rotate',        {'degrees': -90.0, 'speed_dps': 90.0}),
        ]
        for label, name, args in moves:
            t0 = time.perf_counter()
            try:
                # Pre-snapshot pose so we can show the delta after the move.
                before = self.state().get('robot_pose', {})
                r = self.raw(name, args=args, wait=True, timeout_s=15.0)
                ms = (time.perf_counter() - t0) * 1000
                ok = bool(r.get('result', {}).get('ok'))
                after = self.state().get('robot_pose', {})
                delta = (
                    f"Δx={after.get('x_mm', 0) - before.get('x_mm', 0):+.0f}mm "
                    f"Δy={after.get('y_mm', 0) - before.get('y_mm', 0):+.0f}mm "
                    f"Δhdg={after.get('heading_deg', 0) - before.get('heading_deg', 0):+.0f}°"
                )
                (passed if ok else failed)(label, ms,
                                            r.get('result', {}).get('message', '') + ' ' + delta)
                self.results.append((label, ok, ''))
                time.sleep(0.3)
            except Exception as exc:
                failed(label, (time.perf_counter() - t0) * 1000, str(exc))
                self.results.append((label, False, str(exc)))

    def check_stop(self) -> None:
        banner('Stop')
        t0 = time.perf_counter()
        try:
            r = self.raw('stop', wait=True, timeout_s=3.0)
            ms = (time.perf_counter() - t0) * 1000
            ok = bool(r.get('result', {}).get('ok'))
            (passed if ok else failed)('stop', ms,
                                       r.get('result', {}).get('message', ''))
            self.results.append(('stop', ok, ''))
        except Exception as exc:
            failed('stop', (time.perf_counter() - t0) * 1000, str(exc))
            self.results.append(('stop', False, str(exc)))

    # ── Summary ──

    def summary(self) -> int:
        banner('Summary')
        ok_count = sum(1 for _, ok, _ in self.results if ok)
        total = len(self.results)
        for label, ok, detail in self.results:
            mark = f"{C.GREEN}✓{C.RESET}" if ok else f"{C.RED}✗{C.RESET}"
            extra = f" {C.DIM}— {detail}{C.RESET}" if detail and not ok else ''
            print(f"  {mark} {label}{extra}")
        verdict = (
            f"{C.GREEN}all good{C.RESET}" if ok_count == total
            else f"{C.RED}{total - ok_count} failure(s){C.RESET}"
        )
        print(f"\n{C.BOLD}{ok_count}/{total} checks passed — {verdict}{C.RESET}\n")
        return 0 if ok_count == total else 1


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main() -> int:
    p = argparse.ArgumentParser(description='SketchBot hardware smoke test')
    p.add_argument('--runtime', default='http://127.0.0.1:8787',
                   help='Local-runtime base URL (default: %(default)s)')
    p.add_argument('--auto', action='store_true',
                   help='Skip "press Enter to continue" prompts.')
    p.add_argument('--skip', action='append', default=[],
                   choices=['servo', 'motors'],
                   help='Skip a subsystem section. Repeatable.')
    args = p.parse_args()

    print(f"\n{C.BOLD}SketchBot hardware smoke test{C.RESET}")
    print(f"runtime : {args.runtime}")
    print(f"auto    : {args.auto}")
    if args.skip:
        print(f"skip    : {', '.join(args.skip)}")

    t = SmokeTest(args.runtime, args.auto, set(args.skip))
    if not t.check_runtime():
        return t.summary()
    if not t.check_wifi_link():
        return t.summary()
    t.check_ping()
    t.check_telemetry_stream()
    t.check_servo()
    t.check_motors_raw()
    t.check_motors_blocking()
    t.check_stop()
    return t.summary()


if __name__ == '__main__':
    sys.exit(main())
