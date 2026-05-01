"""
AgentSessionManager — registry of active TutorAgent instances.

Owns:
    - The dict of session_id → TutorAgent for currently-attached or
      grace-period agents
    - Concurrent-session limit enforcement
    - Agent eviction (after RECONNECT_GRACE_SEC of no connection)
    - Graceful drain hook for deployment shutdown

Phase 1 scope: in-memory only. Phase 4 swaps the underlying store for
a Redis/disk-backed implementation that survives instance restarts.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from app.services.tutor_agent import (
    RECONNECT_GRACE_SEC,
    AgentIdentity,
    TutorAgent,
)

logger = logging.getLogger("sketchbot.tutor.agent_mgr")

# Standard plan on Render gives ~2GB RAM. Each agent is ~50-100MB worst-case
# with conversation history + working memory. 25 keeps headroom for the
# rest of the server (FastAPI, etc).
MAX_CONCURRENT_AGENTS = 25

# How often the eviction loop scans for stale agents.
EVICTION_TICK_SEC = 30


class AgentSessionManager:
    def __init__(self) -> None:
        self._agents: dict[str, TutorAgent] = {}
        self._lock = asyncio.Lock()
        self._eviction_task: asyncio.Task | None = None
        self._draining = False

    # ─── Lifecycle ───────────────────────────────────────────────────────

    def start(self) -> None:
        """Called once on FastAPI startup."""
        if self._eviction_task is None:
            self._eviction_task = asyncio.create_task(self._eviction_loop())
            logger.info("agent_mgr.started max_concurrent=%d", MAX_CONCURRENT_AGENTS)

    async def shutdown(self) -> None:
        """Called on FastAPI shutdown. Notifies every agent to drain, then
        closes them all. Renderer side handles reconnection on the new
        instance."""
        self._draining = True
        if self._eviction_task is not None:
            self._eviction_task.cancel()
            self._eviction_task = None

        async with self._lock:
            agents = list(self._agents.values())

        # Tell each agent to drain — they send the `restart` message to
        # their renderer so the user sees a friendly notice.
        signal_tasks = [asyncio.create_task(a.signal_drain()) for a in agents]
        if signal_tasks:
            await asyncio.gather(*signal_tasks, return_exceptions=True)

        # Then shut them down.
        shutdown_tasks = [asyncio.create_task(a.shutdown()) for a in agents]
        if shutdown_tasks:
            await asyncio.gather(*shutdown_tasks, return_exceptions=True)

        async with self._lock:
            self._agents.clear()

        logger.info("agent_mgr.shutdown complete (drained %d agents)", len(agents))

    # ─── Connection handling ────────────────────────────────────────────

    async def get_or_create(self, identity: AgentIdentity) -> tuple[TutorAgent, bool]:
        """
        Return (agent, resumed_flag).
        resumed_flag is True iff we found an existing agent for this
        session_id (reconnection within grace period).
        Raises RuntimeError if at-capacity and a fresh agent is needed.
        """
        async with self._lock:
            existing = self._agents.get(identity.session_id)
            if existing is not None:
                return existing, True

            if self._draining:
                raise RuntimeError("server is draining, please retry shortly")

            if len(self._agents) >= MAX_CONCURRENT_AGENTS:
                # Last-resort: evict the oldest stale agent if any
                self._evict_stale_locked()
                if len(self._agents) >= MAX_CONCURRENT_AGENTS:
                    raise RuntimeError("at capacity")

            agent = TutorAgent(identity)
            self._agents[identity.session_id] = agent
            logger.info(
                "agent_mgr.created session_id=%s active=%d",
                identity.session_id, len(self._agents),
            )
            return agent, False

    async def remove(self, session_id: str) -> None:
        """Permanently remove an agent (e.g. user explicitly ended session)."""
        async with self._lock:
            agent = self._agents.pop(session_id, None)
        if agent is not None:
            await agent.shutdown()
            logger.info("agent_mgr.removed session_id=%s", session_id)

    # ─── Eviction loop ──────────────────────────────────────────────────

    async def _eviction_loop(self) -> None:
        """Periodically evict agents whose WS has been gone past the grace
        period. Renderer can reconnect any time before that."""
        try:
            while True:
                await asyncio.sleep(EVICTION_TICK_SEC)
                async with self._lock:
                    self._evict_stale_locked()
        except asyncio.CancelledError:
            return

    def _evict_stale_locked(self) -> None:
        """MUST be called with self._lock held."""
        now = time.time()
        stale = []
        for session_id, agent in self._agents.items():
            # No active WS AND grace period elapsed → evict.
            if (
                agent._ws is None
                and agent.last_detached_at > 0
                and (now - agent.last_detached_at) > RECONNECT_GRACE_SEC
            ):
                stale.append(session_id)
        for session_id in stale:
            agent = self._agents.pop(session_id, None)
            if agent is not None:
                # Schedule shutdown — don't await inside the lock.
                asyncio.create_task(agent.shutdown())
                logger.info(
                    "agent_mgr.evicted session_id=%s grace_elapsed=%ss",
                    session_id, int(now - agent.last_detached_at),
                )

    # ─── Diagnostics ─────────────────────────────────────────────────────

    def stats(self) -> dict:
        return {
            "active_count": len(self._agents),
            "max_concurrent": MAX_CONCURRENT_AGENTS,
            "draining": self._draining,
            "agents": [a.stats() for a in self._agents.values()],
        }


# Module-level singleton — one manager per backend instance.
agent_session_manager = AgentSessionManager()
