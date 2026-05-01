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

# How long the agent waits between event-driven reasoning bursts before
# also firing a slow safety tick. Real cadence is event-driven; this is
# a backstop so the agent doesn't go silent forever if events stall.
SAFETY_TICK_SEC = 60

# Hard floor between reasoning calls — protects Anthropic spend even if
# events flood in.
THINK_RATE_LIMIT_SEC = 8

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
BUILD_SETTLE_SEC = 3.0

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
        self._safety_tick_task: asyncio.Task | None = None

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
        # Start the safety tick on first attach. Reattaches don't double-
        # spawn it because we cancel on detach.
        self._safety_tick_task = asyncio.create_task(self._safety_tick_loop())

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
        if self._safety_tick_task is not None:
            self._safety_tick_task.cancel()
            self._safety_tick_task = None
        if self._build_settle_task is not None:
            self._build_settle_task.cancel()
            self._build_settle_task = None
        self._ws = None
        self.last_detached_at = time.time()
        logger.info("agent.detached session_id=%s", self.id)

    async def shutdown(self) -> None:
        """Final cleanup. Called on session close or eviction."""
        self._closed = True
        for task in (self._heartbeat_task, self._safety_tick_task, self._build_settle_task):
            if task is not None:
                task.cancel()
        self._heartbeat_task = None
        self._safety_tick_task = None
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
            # Phase 2+: route user-typed chat through the agent. v1 keeps
            # the existing /api/tutor/message HTTP endpoint.
            logger.debug("agent.chat_ignored session_id=%s (handled by /message)", self.id)
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
        # Phase 3 will feed tool results back into a multi-turn reasoning
        # loop. For Phase 2 we just log; the agent's next think pulls
        # fresh context anyway.
        logger.debug(
            "agent.tool_result session_id=%s tool_id=%s ok=%s",
            self.id, msg.get("tool_id"), msg.get("ok"),
        )

    # ─── Reasoning core ──────────────────────────────────────────────────

    async def _build_settle_then_think(self, last_kind: str) -> None:
        try:
            await asyncio.sleep(BUILD_SETTLE_SEC)
        except asyncio.CancelledError:
            return
        await self._maybe_think("build_settled:" + last_kind)

    async def _safety_tick_loop(self) -> None:
        """Backstop tick — if events stall, the agent still wakes up
        every SAFETY_TICK_SEC to consider whether to say something. This
        is only triggered when there's been activity since the last
        think; a truly idle session goes quiet."""
        try:
            while not self._closed and self._ws is not None:
                await asyncio.sleep(SAFETY_TICK_SEC)
                if self._closed or self._ws is None:
                    return
                # Only fire if there's been something to react to since
                # the last think — no point burning tokens on dead air.
                if self._has_unprocessed_activity():
                    await self._maybe_think("safety_tick")
        except asyncio.CancelledError:
            return

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
            return
        async with self._think_lock:
            if self._closed or self._ws is None:
                return

            ctx = self.latest_context_text or ""
            if not ctx.strip():
                # Renderer hasn't pushed any context yet. Stay silent;
                # the next context push will unblock us.
                return

            # Optional "thinking..." indicator for the face-mode UI. The
            # renderer is free to ignore.
            try:
                await self.send({"type": MSG_THINKING, "status": "observing"})
            except Exception:  # noqa: BLE001
                return

            try:
                result = await tutor_service.observe(
                    student_name=self.identity.student_name,
                    age_group=self.identity.age_group,
                    actor_role=self.identity.actor_role,
                    concept_id=self.identity.concept_id or "free-draw",
                    layer=self.identity.layer,
                    context_text=ctx,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "agent.think_failed session_id=%s trigger=%s err=%s",
                    self.id, trigger, exc,
                )
                return

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

            # Honour the agent's self-paced cadence hint by adjusting the
            # safety tick — kept simple for now (next_check influences
            # nothing here in Phase 2; Phase 3 will drive scheduling
            # dynamically based on this signal).

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
            "drain_pending": self._drain_pending,
            "ws_connected": self._ws is not None,
        }
