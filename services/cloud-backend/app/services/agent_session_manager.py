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

from app.services import agent_state_repo
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

# After sending MSG_RESTART, wait this long for the renderer to actually
# process it and start its own reconnect timer before we close the WS.
# Render's default SIGTERM-to-SIGKILL window is ~30s, so 0.5s here is
# cheap insurance against frames being dropped on a slow client.
DRAIN_NOTIFY_GRACE_SEC = 0.5

# How long to wait for an in-flight think_and_act to complete before
# forcing shutdown. Agent reasoning calls are typically 2-6s; budgeting
# 10s covers the long tail (Anthropic retry + thinking) without eating
# the rest of Render's drain window.
DRAIN_INFLIGHT_TIMEOUT_SEC = 10.0


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
        """Called on FastAPI shutdown. Three phases per agent:
            1. signal_drain — send MSG_RESTART so the renderer schedules
               its own reconnect.
            2. wait — give the renderer a moment to ack, then wait for
               any in-flight think_and_act to finish (bounded). Without
               this, a SIGTERM mid-Anthropic-call would kill the response
               and the kid would see nothing.
            3. shutdown — close the WS and cancel remaining tasks.

        Total budget stays well under Render's 30 s SIGTERM-to-SIGKILL
        window (notify grace + inflight timeout = ~10.5 s, with the rest
        of the work bounded to a few hundred ms).
        """
        self._draining = True
        if self._eviction_task is not None:
            self._eviction_task.cancel()
            self._eviction_task = None

        async with self._lock:
            agents = list(self._agents.values())

        if not agents:
            logger.info("agent_mgr.shutdown complete (no agents)")
            return

        # Phase 1: notify renderers to start reconnecting.
        signal_tasks = [asyncio.create_task(a.signal_drain()) for a in agents]
        await asyncio.gather(*signal_tasks, return_exceptions=True)

        # Brief grace so the MSG_RESTART frames actually leave the wire
        # before we close the sockets.
        await asyncio.sleep(DRAIN_NOTIFY_GRACE_SEC)

        # Phase 2: wait for any in-flight thinks to release their locks.
        # Each agent runs in parallel — bounded by its own timeout below
        # so a stuck think can't hold up the whole shutdown.
        await asyncio.gather(
            *[asyncio.create_task(self._wait_for_think(a)) for a in agents],
            return_exceptions=True,
        )

        # Phase 3: tear down agents (close WS, cancel tasks).
        shutdown_tasks = [asyncio.create_task(a.shutdown()) for a in agents]
        await asyncio.gather(*shutdown_tasks, return_exceptions=True)

        async with self._lock:
            self._agents.clear()

        logger.info("agent_mgr.shutdown complete (drained %d agents)", len(agents))

    @staticmethod
    async def _wait_for_think(agent: TutorAgent) -> None:
        """Block until agent's think_lock is free, or timeout. Logs the
        wait so we can see how often drains hit mid-think."""
        try:
            await asyncio.wait_for(
                agent._think_lock.acquire(),
                timeout=DRAIN_INFLIGHT_TIMEOUT_SEC,
            )
            agent._think_lock.release()
        except asyncio.TimeoutError:
            logger.warning(
                "agent_mgr.drain_inflight_timeout session_id=%s — "
                "think_and_act still running after %.0fs, forcing shutdown",
                agent.id, DRAIN_INFLIGHT_TIMEOUT_SEC,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "agent_mgr.drain_inflight_error session_id=%s err=%s",
                agent.id, exc,
            )

    # ─── Connection handling ────────────────────────────────────────────

    async def get_or_create(self, identity: AgentIdentity) -> tuple[TutorAgent, bool]:
        """
        Return (agent, resumed_flag).
        resumed_flag is True iff we recovered prior state for this
        session_id — either from the in-memory grace window OR from
        Supabase persistence (post-deploy reconnect).
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

        # Try to restore from Supabase if the previous instance saved
        # state for this session_id. The repo is a no-op when
        # TUTOR_PERSIST_ENABLED is false, so this stays free for
        # single-instance deployments. Done outside the lock — load
        # involves a network round-trip we don't want to serialise.
        persisted = await agent_state_repo.load(identity.session_id)

        async with self._lock:
            # Re-check existing in case another caller raced past us
            # while we were loading.
            existing = self._agents.get(identity.session_id)
            if existing is not None:
                return existing, True

            if persisted is not None:
                agent = TutorAgent.from_persisted(identity, persisted)
                resumed = True
            else:
                agent = TutorAgent(identity)
                resumed = False
            self._agents[identity.session_id] = agent
            logger.info(
                "agent_mgr.created session_id=%s active=%d resumed=%s",
                identity.session_id, len(self._agents), resumed,
            )
            return agent, resumed

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
