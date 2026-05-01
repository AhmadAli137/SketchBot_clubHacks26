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

logger = logging.getLogger("sketchbot.tutor.agent")

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
        self._ws = None
        self.last_detached_at = time.time()
        logger.info("agent.detached session_id=%s", self.id)

    async def shutdown(self) -> None:
        """Final cleanup. Called on session close or eviction."""
        self._closed = True
        if self._heartbeat_task is not None:
            self._heartbeat_task.cancel()
            self._heartbeat_task = None
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
        # Phase 1: just log. Phase 3 will trigger think_and_act() from here.
        logger.debug(
            "agent.event session_id=%s kind=%s payload=%s",
            self.id, evt.kind, evt.payload,
        )

    async def _on_context(self, msg: dict[str, Any]) -> None:
        # Phase 1: just acknowledge receipt. Phase 2+ stores this for the
        # next think_and_act() call.
        snapshot = msg.get("snapshot") or {}
        logger.debug(
            "agent.context session_id=%s objects=%s events=%s",
            self.id,
            (snapshot.get("scene") or {}).get("objectCount"),
            len((snapshot.get("events") or {}).get("recent") or []),
        )

    async def _on_tool_result(self, msg: dict[str, Any]) -> None:
        # Phase 3+: feed back into the think loop.
        logger.debug(
            "agent.tool_result session_id=%s tool_id=%s ok=%s",
            self.id, msg.get("tool_id"), msg.get("ok"),
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
            "drain_pending": self._drain_pending,
            "ws_connected": self._ws is not None,
        }
