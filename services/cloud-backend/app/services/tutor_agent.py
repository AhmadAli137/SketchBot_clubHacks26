"""
TutorAgent — long-lived per-session agent process.

Architectural intent (Plan B from the agentic refactor):
    A TutorAgent instance is created when a student opens a session and
    lives until they close it. It receives a streaming feed of events
    from the renderer over WebSocket, maintains its own working memory,
    decides its own pacing, and pushes responses back over the same
    socket. This is the unit of intelligence that replaces the previous
    stateless `/api/tutor/observe` poll loop.

Phase 1 (this file): scaffolding only.
    - Lifecycle methods (attach, detach, shutdown)
    - Event log + working memory containers
    - Send helpers
    - Heartbeat
    - NO LLM yet — we verify the wire is solid before any intelligence
      moves over it. Phase 2 ports the observation behavior in.

Per-agent state is INTENTIONALLY in-memory for v1. Phase 4 adds the
Redis/disk persistence layer that survives reconnects + deploys.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

from app.services.tutor_service import tutor_service

logger = logging.getLogger("sketchbot.tutor.agent")

# Default cadence between thinks when the agent doesn't return its own
# next_check hint. Acts as both the initial-attach delay and the floor
# for a self-paced cycle. Lowered from 60s to 30s when we shifted from
# "curious bystander" to "mission-driven tutor" — every idle tick is a
# chance to propose a next step.
SAFETY_TICK_SEC = 30
# Bounds for the self-paced cadence (mirrors tutor_service.observe's
# clamp). Stops a runaway model value from breaking the loop.
NEXT_CHECK_MIN_SEC = 5
NEXT_CHECK_MAX_SEC = 180

# Hard floor between reasoning calls — protects Anthropic spend even if
# events flood in.
THINK_RATE_LIMIT_SEC = 6

# Event kinds that should immediately trigger think_and_act. Outcome-y
# events worth reacting to; raw build events (place/delete/rotate) are
# debounced via _build_settle_task instead.
IMMEDIATE_THINK_KINDS = frozenset({
    "sim.complete", "sim.fail",
    "tutor.evaluation.pass", "tutor.evaluation.fail",
    "tutor.level-up", "tutor.layer-up", "tutor.concept-mastered",
    "session.return",
})

BUILD_EVENT_KINDS = frozenset({
    "user.place", "user.delete", "user.rotate", "user.code-run",
})

# How long to wait after the last build event before firing a tick.
# 1.5s is short enough to feel responsive but long enough to coalesce a
# burst of placements into one think.
BUILD_SETTLE_SEC = 1.5

# ─── Protocol message types (mirror lib/tutor-ws-protocol.ts on frontend) ────

# Client → server
MSG_HELLO = "hello"
MSG_EVENT = "event"
MSG_CONTEXT = "context"
MSG_CHAT = "chat"
MSG_TOOL_RESULT = "tool_result"
MSG_PING = "ping"

# Server → client
MSG_WELCOME = "welcome"
MSG_SPEAK = "speak"
MSG_TOOL_CALL = "tool_call"
MSG_THINKING = "thinking"
MSG_PONG = "pong"
MSG_RESTART = "restart"
MSG_ERROR = "error"

# Configurable knobs
EVENT_LOG_MAX = 50
HEARTBEAT_INTERVAL_SEC = 25
RECONNECT_GRACE_SEC = 60


@dataclass
class AgentEvent:
    """An event the renderer pushed up. Mirrors SparkEventDetail on FE."""
    kind: str
    payload: dict[str, Any] | None
    ts: float
    received_at: float = field(default_factory=time.time)


@dataclass
class AgentIdentity:
    """Stable handshake info from the renderer's `hello`."""
    session_id: str
    student_name: str
    age_group: str = "builder"
    actor_role: str = "student"
    concept_id: str | None = None
    layer: str = "intuitive"


class TutorAgent:
    """
    One per active student session. Lives in memory for the duration of
    the session. WebSocket can attach/detach (reconnections); the agent
    itself outlives the connection by RECONNECT_GRACE_SEC.
    """

    def __init__(self, identity: AgentIdentity) -> None:
        self.id = identity.session_id
        self.identity = identity

        # ── Working memory (Phase 1 stubs; Phase 3 fleshes out) ──────────
        self.event_log: deque[AgentEvent] = deque(maxlen=EVENT_LOG_MAX)
        self.last_speak_ts: float = 0.0
        self.consecutive_silent_ticks: int = 0
        self.hypothesis: str | None = None       # what I think the kid is doing
        self.last_thought: str | None = None     # what I almost said but held back

        # ── Latest context snapshot from the renderer ────────────────────
        # The frontend pushes a full SparkContext text periodically; the
        # agent uses the most recent one when reasoning. None until the
        # first `context` arrives.
        self.latest_context_text: str | None = None
        self.latest_context_received_at: float = 0.0

        # ── Reasoning lifecycle ──────────────────────────────────────────
        self.last_think_at: float = 0.0
        self._build_settle_task: asyncio.Task | None = None
        # Self-paced one-shot, re-armed after each think_and_act using
        # next_check from the model. Replaces the old fixed safety_tick
        # loop so the agent itself decides when to wake up next.
        self._self_paced_task: asyncio.Task | None = None
        self.last_next_check_sec: float | None = None

        # ── I/O ──────────────────────────────────────────────────────────
        self._ws: WebSocket | None = None
        self._heartbeat_task: asyncio.Task | None = None
        self._think_lock = asyncio.Lock()
        self._closed = False
        self._drain_pending = False

        # ── Lifecycle bookkeeping ────────────────────────────────────────
        self.created_at = time.time()
        self.last_attached_at: float = 0.0
        self.last_detached_at: float = 0.0

        logger.info(
            "agent.created session_id=%s student=%s",
            identity.session_id, identity.student_name,
        )

    # ─── Lifecycle ───────────────────────────────────────────────────────

    async def attach(self, ws: WebSocket, *, resumed: bool) -> None:
        """Bind a (fresh or reconnected) WebSocket to this agent."""
        if self._ws is not None:
            # Already attached — politely close the old one. The renderer
            # can only have one active connection per agent.
            try:
                await self._ws.close(code=1000, reason="superseded by new connection")
            except Exception:  # noqa: BLE001
                pass

        self._ws = ws
        self.last_attached_at = time.time()
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        # First self-paced tick fires after SAFETY_TICK_SEC; subsequent
        # ones are scheduled by think_and_act using next_check.
        self._arm_next_tick(SAFETY_TICK_SEC, reason="initial_attach")

        await self.send({
            "type": MSG_WELCOME,
            "agent_id": self.id,
            "resumed": resumed,
            "server_time": time.time(),
        })
        logger.info("agent.attached session_id=%s resumed=%s", self.id, resumed)

    async def detach(self) -> None:
        """WS closed. Agent stays alive in memory for a grace period in case
        of reconnect; session manager handles eventual eviction."""
        if self._heartbeat_task is not None:
            self._heartbeat_task.cancel()
            self._heartbeat_task = None
        if self._self_paced_task is not None:
            self._self_paced_task.cancel()
            self._self_paced_task = None
        if self._build_settle_task is not None:
            self._build_settle_task.cancel()
            self._build_settle_task = None
        self._ws = None
        self.last_detached_at = time.time()
        logger.info("agent.detached session_id=%s", self.id)

    async def shutdown(self) -> None:
        """Final cleanup. Called on session close or eviction."""
        self._closed = True
        for task in (self._heartbeat_task, self._self_paced_task, self._build_settle_task):
            if task is not None:
                task.cancel()
        self._heartbeat_task = None
        self._self_paced_task = None
        self._build_settle_task = None
        if self._ws is not None:
            try:
                await self._ws.close(code=1000, reason="agent shutdown")
            except Exception:  # noqa: BLE001
                pass
            self._ws = None
        logger.info("agent.shutdown session_id=%s", self.id)

    async def signal_drain(self) -> None:
        """Deployment drain — let the renderer know we're restarting."""
        self._drain_pending = True
        await self.send({
            "type": MSG_RESTART,
            "reason": "deploying",
            "reconnect_in_ms": 5_000,
        })

    # ─── Heartbeat ───────────────────────────────────────────────────────

    async def _heartbeat_loop(self) -> None:
        """Periodic ping to keep the connection warm and detect dead peers."""
        try:
            while not self._closed and self._ws is not None:
                await asyncio.sleep(HEARTBEAT_INTERVAL_SEC)
                if self._ws is None or self._closed:
                    return
                try:
                    await self.send({"type": MSG_PONG, "ts": time.time()})
                except Exception:  # noqa: BLE001
                    # Send failure means the WS is dead — let the recv loop
                    # discover it and call detach().
                    return
        except asyncio.CancelledError:
            return

    # ─── Inbound: messages from the renderer ─────────────────────────────

    async def handle_message(self, msg: dict[str, Any]) -> None:
        """Route an inbound JSON message from the WebSocket."""
        msg_type = msg.get("type")
        if msg_type == MSG_PING:
            await self.send({"type": MSG_PONG, "ts": time.time()})
            return
        if msg_type == MSG_EVENT:
            await self._on_event(msg)
            return
        if msg_type == MSG_CONTEXT:
            await self._on_context(msg)
            return
        if msg_type == MSG_TOOL_RESULT:
            await self._on_tool_result(msg)
            return
        if msg_type == MSG_CHAT:
            await self._on_chat(msg)
            return

        logger.warning("agent.unknown_msg session_id=%s type=%r", self.id, msg_type)

    async def _on_event(self, msg: dict[str, Any]) -> None:
        evt = AgentEvent(
            kind=str(msg.get("kind", "")),
            payload=msg.get("payload") if isinstance(msg.get("payload"), dict) else None,
            ts=float(msg.get("ts", time.time() * 1000)) / 1000.0,
        )
        self.event_log.append(evt)
        logger.debug(
            "agent.event session_id=%s kind=%s payload=%s",
            self.id, evt.kind, evt.payload,
        )

        # Outcome events → reason immediately (subject to rate limit).
        if evt.kind in IMMEDIATE_THINK_KINDS:
            await self._maybe_think("event:" + evt.kind)
            return

        # Build events → debounced. Reset the settle timer; if no further
        # build event arrives within BUILD_SETTLE_SEC, fire reasoning.
        if evt.kind in BUILD_EVENT_KINDS:
            if self._build_settle_task is not None:
                self._build_settle_task.cancel()
            self._build_settle_task = asyncio.create_task(
                self._build_settle_then_think(evt.kind),
            )

    async def _on_chat(self, msg: dict[str, Any]) -> None:
        """User typed (or spoke) a reply. Append to the event log so the
        agent's working memory tracks it.

        We deliberately do NOT trigger think_and_act here: the existing
        /api/tutor/message HTTP path produces the synchronous streaming
        reply the renderer renders inline. Triggering an additional WS
        think would double-speak. Mission continuity is preserved
        because the renderer's next context push (every 8s) includes
        the latest chat in its situational-awareness preamble — the
        agent sees what was said and reasons about it on the next
        outcome / build / safety tick.
        """
        text = str(msg.get("text") or "").strip()
        if not text:
            return
        evt = AgentEvent(
            kind="chat.user",
            payload={"text": text[:500]},  # cap to keep event log light
            ts=time.time(),
        )
        self.event_log.append(evt)
        logger.info(
            "agent.chat session_id=%s len=%d",
            self.id, len(text),
        )

    async def _on_context(self, msg: dict[str, Any]) -> None:
        """Cache the latest situational-awareness preamble from the
        renderer. Used as the next think_and_act's context_text."""
        text = str(msg.get("context_text") or "")
        if text.strip():
            self.latest_context_text = text
            self.latest_context_received_at = time.time()
            logger.debug(
                "agent.context session_id=%s len=%d",
                self.id, len(text),
            )

    async def _on_tool_result(self, msg: dict[str, Any]) -> None:
        """Renderer dispatched a tool call we requested and is reporting
        the outcome. Append to event_log so the next think can reason
        about what happened (e.g., "I highlighted the cones — now I can
        comment on which ones I picked"). Deliberately doesn't trigger
        an immediate think to avoid tool→think→tool loops; the next
        scheduled tick will pick it up via the updated event log.
        """
        tool_id = str(msg.get("tool_id") or "")
        ok = bool(msg.get("ok", True))
        evt = AgentEvent(
            kind="tool.result",
            payload={
                "tool_id": tool_id,
                "ok": ok,
                "data": msg.get("data") if isinstance(msg.get("data"), dict) else None,
                "message": str(msg.get("message") or "")[:300] or None,
            },
            ts=time.time(),
        )
        self.event_log.append(evt)
        logger.info(
            "agent.tool_result session_id=%s tool_id=%s ok=%s",
            self.id, tool_id, ok,
        )

    # ─── Reasoning core ──────────────────────────────────────────────────

    async def _build_settle_then_think(self, last_kind: str) -> None:
        try:
            await asyncio.sleep(BUILD_SETTLE_SEC)
        except asyncio.CancelledError:
            return
        await self._maybe_think("build_settled:" + last_kind)

    def _arm_next_tick(self, seconds: float, *, reason: str) -> None:
        """Schedule the next self-paced think. Re-armed after every
        successful think_and_act using the model's next_check hint, so
        the agent decides its own cadence — short when something is
        unfolding, long when the kid is in flow.

        Cancels any pending self-paced task so we never have two timers
        racing. Build/immediate event triggers run independently and
        will re-arm via think_and_act when they complete.
        """
        seconds = max(NEXT_CHECK_MIN_SEC, min(NEXT_CHECK_MAX_SEC, float(seconds)))
        if self._self_paced_task is not None:
            self._self_paced_task.cancel()
        self.last_next_check_sec = seconds

        async def _wait_then_think() -> None:
            try:
                await asyncio.sleep(seconds)
            except asyncio.CancelledError:
                return
            if self._closed or self._ws is None:
                return
            # Mirror the old safety-tick gate — don't burn tokens on
            # dead air. Long cadences (>60s) imply the agent expects
            # nothing, so honour silence; short cadences imply the
            # agent wants to check back regardless of activity.
            if seconds > 60 and not self._has_unprocessed_activity():
                # Re-arm at the same cadence to keep checking, but
                # don't fire a think.
                self._arm_next_tick(seconds, reason=reason + ":quiet")
                return
            await self._maybe_think(f"self_paced:{reason}")

        self._self_paced_task = asyncio.create_task(_wait_then_think())

    def _has_unprocessed_activity(self) -> bool:
        if not self.event_log:
            return False
        last_event = self.event_log[-1]
        return last_event.received_at > self.last_think_at

    async def _maybe_think(self, trigger: str) -> None:
        """Rate-limited entry point to the reasoning loop. Drops the call
        if we thought too recently or the WS is gone."""
        if self._closed or self._ws is None:
            return
        now = time.time()
        if (now - self.last_think_at) < THINK_RATE_LIMIT_SEC:
            logger.debug(
                "agent.think_skip rate_limited session_id=%s trigger=%s",
                self.id, trigger,
            )
            return
        self.last_think_at = now
        # Don't await — fire and forget so events keep flowing in. The
        # think_lock inside think_and_act serialises actual reasoning.
        asyncio.create_task(self.think_and_act(trigger))

    async def think_and_act(self, trigger: str) -> None:
        """Run one reasoning pass. Reuses tutor_service.observe so the
        prompt + extended-thinking + tool config stays in one place. The
        result is delivered to the renderer over the WebSocket as
        `speak` / `tool_call` messages instead of an HTTP response."""
        # Serialise reasoning so a flood of events doesn't spawn
        # overlapping LLM calls. Events still queue in the event_log.
        if self._think_lock.locked():
            logger.info(
                "agent.think_dropped reason=lock_held session_id=%s trigger=%s",
                self.id, trigger,
            )
            return
        t_start = time.time()
        async with self._think_lock:
            if self._closed or self._ws is None:
                return

            ctx = self.latest_context_text or ""
            if not ctx.strip():
                # Renderer hasn't pushed any context yet. Stay silent;
                # the next context push will unblock us.
                logger.info(
                    "agent.think_dropped reason=no_context session_id=%s trigger=%s",
                    self.id, trigger,
                )
                return

            # Optional "thinking..." indicator for the face-mode UI. The
            # renderer is free to ignore.
            try:
                await self.send({"type": MSG_THINKING, "status": "observing"})
            except Exception:  # noqa: BLE001
                return

            t_observe_start = time.time()
            try:
                result = await tutor_service.observe(
                    student_name=self.identity.student_name,
                    age_group=self.identity.age_group,
                    actor_role=self.identity.actor_role,
                    concept_id=self.identity.concept_id or "free-draw",
                    layer=self.identity.layer,
                    context_text=ctx,
                    prior_hypothesis=self.hypothesis,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "agent.think_failed session_id=%s trigger=%s elapsed_ms=%d err=%s",
                    self.id, trigger,
                    int((time.time() - t_observe_start) * 1000), exc,
                )
                return
            observe_ms = int((time.time() - t_observe_start) * 1000)

            # Deliver speak (if any). Tool calls come as a separate WS
            # message right after so the renderer can dispatch in order.
            if result.get("speak") and result.get("message"):
                self.last_speak_ts = time.time()
                await self.send({
                    "type": MSG_SPEAK,
                    "id": f"{self.id}-{int(self.last_speak_ts * 1000)}",
                    "message": result["message"],
                })
                logger.info(
                    "agent.speak session_id=%s trigger=%s len=%d",
                    self.id, trigger, len(result["message"]),
                )

            tool_request = result.get("tool_request")
            if tool_request and tool_request.get("id"):
                await self.send({
                    "type": MSG_TOOL_CALL,
                    "id": f"{self.id}-tc-{int(time.time() * 1000)}",
                    "tool_id": tool_request["id"],
                    "input": tool_request.get("input") or {},
                    "reason": tool_request.get("reason") or "",
                })
                logger.info(
                    "agent.tool session_id=%s trigger=%s tool=%s",
                    self.id, trigger, tool_request["id"],
                )

            # Carry the agent's working-memory hypothesis forward to
            # the next tick. The model refines this each call with its
            # current read of the session (what the kid is doing,
            # what the active mission is). Persisting it gives the
            # agent self-continuity across thinks.
            new_hypothesis = result.get("hypothesis")
            if isinstance(new_hypothesis, str) and new_hypothesis.strip():
                self.hypothesis = new_hypothesis.strip()

            # Honour the agent's self-paced cadence hint. The model
            # returns next_check (5-180s) saying when it'd like to be
            # invoked again — short when something interesting is
            # unfolding, long when the kid is in flow. Falls back to
            # SAFETY_TICK_SEC if the model omitted it.
            next_check = result.get("next_check")
            if not isinstance(next_check, (int, float)) or next_check <= 0:
                next_check = SAFETY_TICK_SEC
            self._arm_next_tick(float(next_check), reason="post_think")

            # Single-line trace per think — grep this to see end-to-end
            # timing without piecing together multiple lines.
            logger.info(
                "agent.trace session_id=%s trigger=%s total_ms=%d observe_ms=%d "
                "spoke=%s tool=%s ctx_len=%d events=%d next_check_s=%.0f",
                self.id, trigger,
                int((time.time() - t_start) * 1000),
                observe_ms,
                bool(result.get("speak") and result.get("message")),
                bool(tool_request and tool_request.get("id")),
                len(ctx), len(self.event_log),
                float(next_check),
            )

    # ─── Outbound helpers ────────────────────────────────────────────────

    async def send(self, payload: dict[str, Any]) -> None:
        if self._ws is None:
            return
        try:
            await self._ws.send_text(json.dumps(payload))
        except Exception as exc:  # noqa: BLE001
            logger.warning("agent.send_failed session_id=%s err=%s", self.id, exc)
            raise

    # ─── Diagnostics ─────────────────────────────────────────────────────

    def stats(self) -> dict[str, Any]:
        return {
            "session_id": self.id,
            "student": self.identity.student_name,
            "age_group": self.identity.age_group,
            "concept_id": self.identity.concept_id,
            "layer": self.identity.layer,
            "created_at": self.created_at,
            "last_attached_at": self.last_attached_at,
            "last_detached_at": self.last_detached_at,
            "event_count": len(self.event_log),
            "last_speak_ts": self.last_speak_ts,
            "last_think_at": self.last_think_at,
            "last_next_check_sec": self.last_next_check_sec,
            "hypothesis": self.hypothesis,
            "drain_pending": self._drain_pending,
            "ws_connected": self._ws is not None,
        }
