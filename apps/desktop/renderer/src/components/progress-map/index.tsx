'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react';
import { X, ShoppingBag, Zap, Star, Trophy, Flame, Lock, ChevronRight } from 'lucide-react';

import { getConceptMapNodes, getConceptById } from '@/lib/concept-catalog';
import { getPathOrderedNodes } from '@/lib/learning-path-order';
import type { AgeGroup } from '@/lib/concept-types';
import {
  getConceptProgressSnapshot,
  getNodeStatus,
  getProgressSummary,
  getStudentXPInfo,
  getStudentProgress,
  getSparks,
  openChest,
  hasOpenedChest,
  getAvailableChests,
  GAMIFICATION_CONFIG,
  LEVEL_CURVE,
} from '@/lib/progress-store';
import { CHESTS, CHEST_TIER_STYLE, type ChestDefinition } from '@/lib/game-economy';
import { playSfx } from '@/lib/game-audio';
import { ChestReward } from './chest-reward';
import { AvatarShop } from './avatar-shop';

const CONCEPT_NODES = getConceptMapNodes();
const ORDERED_PATH = getPathOrderedNodes(CONCEPT_NODES);

type NodeStatus = 'locked' | 'available' | 'in-progress' | 'almost' | 'mastered';

// ─── Zigzag layout: nodes alternate left/right like Duolingo ─────────────────
const ZIGZAG_OFFSETS = [50, 30, 70, 25, 75, 40, 60, 28, 72, 50];

function getNodeX(index: number): number {
  return ZIGZAG_OFFSETS[index % ZIGZAG_OFFSETS.length];
}

// ─── Star rating: 1–3 stars based on layer completion ────────────────────────
function getStarCount(conceptId: string, studentName: string): number {
  const snap = getConceptProgressSnapshot(studentName, conceptId);
  if (!snap) return 0;
  return (['intuitive', 'structural', 'precise'] as const)
    .filter((l) => snap.layer_progress[l] === 'completed').length;
}

// ─── League sections ──────────────────────────────────────────────────────────
type League = { label: string; emoji: string; color: string; startIndex: number };
const LEAGUES: League[] = [
  { label: 'Rookie',   emoji: '🌱', color: '#4dffb8', startIndex: 0  },
  { label: 'Explorer', emoji: '🗺️', color: '#5de4ff', startIndex: 3  },
  { label: 'Builder',  emoji: '⚙️', color: '#6b7cff', startIndex: 6  },
  { label: 'Engineer', emoji: '🏆', color: '#ffd700', startIndex: 9  },
];

function getLeagueForIndex(index: number): League {
  let league = LEAGUES[0];
  for (const l of LEAGUES) {
    if (index >= l.startIndex) league = l;
  }
  return league;
}

// ─── Connector path between nodes ────────────────────────────────────────────
function NodeConnector({ fromX, toX, done }: { fromX: number; toX: number; done: boolean }) {
  return (
    <div
      className="pmap-connector"
      style={{
        left: `${Math.min(fromX, toX)}%`,
        width: `${Math.abs(fromX - toX)}%`,
        background: done ? 'linear-gradient(90deg, var(--cyan), #4dffb8)' : 'rgba(255,255,255,0.08)',
      }}
    />
  );
}

// ─── Star display ─────────────────────────────────────────────────────────────
function StarRow({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <div className="pmap-stars">
      {Array.from({ length: max }, (_, i) => (
        <motion.span
          key={i}
          className={`pmap-star ${i < count ? 'filled' : 'empty'}`}
          initial={i < count ? { scale: 0 } : {}}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.06, type: 'spring', damping: 12 }}
        >
          ★
        </motion.span>
      ))}
    </div>
  );
}

// ─── Chest node on the path ───────────────────────────────────────────────────
function ChestNode({
  chest,
  opened,
  available,
  x,
  onClick,
}: {
  chest: ChestDefinition;
  opened: boolean;
  available: boolean;
  x: number;
  onClick: () => void;
}) {
  const style = CHEST_TIER_STYLE[chest.tier];
  return (
    <motion.div
      className={`pmap-chest-node ${opened ? 'opened' : ''} ${available && !opened ? 'available' : ''}`}
      style={{ left: `${x}%` }}
      whileHover={available && !opened ? { scale: 1.12, y: -4 } : {}}
      whileTap={available && !opened ? { scale: 0.95 } : {}}
      onClick={available && !opened ? onClick : undefined}
      animate={available && !opened ? { y: [0, -5, 0] } : {}}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div
        className="pmap-chest-icon"
        style={{
          background: opened ? 'rgba(255,255,255,0.05)' : style.bg,
          boxShadow: available && !opened ? `0 0 20px ${style.glow}` : 'none',
          opacity: opened ? 0.4 : 1,
        }}
      >
        <span>{opened ? '✅' : chest.emoji}</span>
      </div>
      {available && !opened && (
        <div className="pmap-chest-pulse" style={{ background: style.glow }} />
      )}
      <div className="pmap-chest-label" style={{ color: opened ? 'var(--muted)' : style.label }}>
        {opened ? 'Opened' : chest.label}
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type ProgressMapProps = {
  studentName: string;
  ageGroup: AgeGroup;
  onConceptSelect: (conceptId: string, conceptTitle: string) => void;
  onClose: () => void;
};

export function ProgressMap({ studentName, ageGroup, onConceptSelect, onClose }: ProgressMapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [starCounts, setStarCounts] = useState<Record<string, number>>({});
  const [sparks, setSparks] = useState(0);
  const [summary, setSummary] = useState<ReturnType<typeof getProgressSummary>>(null);
  const [activeChest, setActiveChest] = useState<{ def: ChestDefinition; result: { sparksAwarded: number; bonusItemId: string | null; newTotal: number } } | null>(null);
  const [showShop, setShowShop] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [chestStates, setChestStates] = useState<Record<string, boolean>>({});
  const [availableChestIds, setAvailableChestIds] = useState<string[]>([]);
  const [justUnlocked, setJustUnlocked] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const xpInfo = getStudentXPInfo(studentName);
    const sum = getProgressSummary(studentName);
    setSparks(getSparks(studentName));
    setSummary(sum);

    const statuses: Record<string, NodeStatus> = {};
    const stars: Record<string, number> = {};
    const rawStatuses: Record<string, 'locked' | 'touched' | 'mastered'> = {};

    CONCEPT_NODES.forEach((node) => {
      rawStatuses[node.id] = getNodeStatus(studentName, node.id);
    });

    CONCEPT_NODES.forEach((node) => {
      const raw = rawStatuses[node.id];
      stars[node.id] = getStarCount(node.id, studentName);
      if (raw === 'mastered') { statuses[node.id] = 'mastered'; return; }
      if (raw === 'touched') {
        const snap = getConceptProgressSnapshot(studentName, node.id);
        const done = snap ? (['intuitive', 'structural', 'precise'] as const).filter((l) => snap.layer_progress[l] === 'completed').length : 0;
        statuses[node.id] = done >= 2 ? 'almost' : 'in-progress';
        return;
      }
      const prereqsMet = node.prerequisites.every((p) => rawStatuses[p] === 'touched' || rawStatuses[p] === 'mastered');
      statuses[node.id] = prereqsMet ? 'available' : 'locked';
    });

    setNodeStatuses(statuses);
    setStarCounts(stars);

    const opened: Record<string, boolean> = {};
    CHESTS.forEach((c) => { opened[c.id] = hasOpenedChest(studentName, c.id); });
    setChestStates(opened);
    setAvailableChestIds(getAvailableChests(studentName));
  }, [studentName]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleChestClick = (chest: ChestDefinition) => {
    playSfx('click');
    const result = openChest(studentName, chest.id);
    if (!result) return;
    setSparks(result.newTotal);
    setActiveChest({ def: chest, result });
    refresh();
  };

  const handleNodeClick = (nodeId: string, status: NodeStatus) => {
    if (status === 'locked') { playSfx('error'); return; }
    playSfx('click');
    setSelectedNode(selectedNode === nodeId ? null : nodeId);
  };

  const handleStartConcept = (nodeId: string, title: string) => {
    playSfx('whoosh');
    onConceptSelect(nodeId, title);
    onClose();
  };

  const masteredCount = summary?.conceptsMastered ?? 0;

  // Insert chest milestones into the path
  const pathItems = useMemo(() => {
    const result: Array<{ type: 'node'; node: typeof ORDERED_PATH[0]; index: number } | { type: 'chest'; chest: ChestDefinition; afterMastered: number }> = [];
    let nodeIndex = 0;
    let prevMastered = 0;

    for (const node of ORDERED_PATH) {
      const status = nodeStatuses[node.id] ?? 'available';
      if (status === 'mastered') prevMastered++;
      const chest = CHESTS.find((c) => c.milestoneAfterConcepts === prevMastered && result.findIndex((r) => r.type === 'chest' && r.chest.id === c.id) === -1);
      if (chest && prevMastered > 0) {
        result.push({ type: 'chest', chest, afterMastered: prevMastered });
      }
      result.push({ type: 'node', node, index: nodeIndex++ });
    }
    return result;
  }, [nodeStatuses]);

  const currentLeague = getLeagueForIndex(masteredCount);

  return (
    <motion.div
      className="pmap-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="pmap-shell">
        {/* ─── Top bar ─── */}
        <div className="pmap-topbar">
          <div className="pmap-topbar-left">
            <div className="pmap-league-badge" style={{ borderColor: currentLeague.color, color: currentLeague.color }}>
              <span>{currentLeague.emoji}</span>
              <span>{currentLeague.label} League</span>
            </div>
            {summary && (
              <div className="pmap-xp-pill">
                <span className="pmap-xp-emoji">{summary.levelEmoji}</span>
                <span>Lv.{summary.level} · {summary.xp} XP</span>
                {summary.streak.current_streak_days > 0 && (
                  <span className="pmap-streak-pill">
                    <Flame size={11} />
                    {summary.streak.current_streak_days}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="pmap-topbar-right">
            <motion.button
              type="button"
              className="pmap-sparks-btn"
              onClick={() => { playSfx('click'); setShowShop(true); }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
            >
              <span className="pmap-spark-icon">⚡</span>
              <motion.span key={sparks} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="pmap-spark-count">
                {sparks}
              </motion.span>
              <ShoppingBag size={13} />
            </motion.button>
            <button type="button" className="pmap-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ─── XP progress bar ─── */}
        {summary && (
          <div className="pmap-xp-bar-wrap">
            <div className="pmap-xp-bar-track">
              <motion.div
                className="pmap-xp-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(summary.progress * 100)}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <div className="pmap-xp-bar-labels">
              <span>{summary.xp} XP</span>
              <span>{summary.level >= 12 ? 'Max Level!' : `${Math.max(0, summary.nextXP - summary.xp)} XP to Lv.${summary.level + 1}`}</span>
            </div>
          </div>
        )}

        {/* ─── Scrollable map ─── */}
        <div className="pmap-scroll" ref={scrollRef}>
          <div className="pmap-path">
            {pathItems.map((item, i) => {
              if (item.type === 'chest') {
                const chestOpened = chestStates[item.chest.id] ?? false;
                const isAvailable = availableChestIds.includes(item.chest.id) || masteredCount >= item.chest.milestoneAfterConcepts;
                const x = getNodeX(Math.floor(i * 0.7));
                return (
                  <div key={item.chest.id} className="pmap-row pmap-row--chest">
                    <div className="pmap-row-spacer" />
                    <ChestNode
                      chest={item.chest}
                      opened={chestOpened}
                      available={isAvailable}
                      x={x}
                      onClick={() => handleChestClick(item.chest)}
                    />
                  </div>
                );
              }

              const { node, index } = item;
              const status = nodeStatuses[node.id] ?? 'available';
              const stars = starCounts[node.id] ?? 0;
              const x = getNodeX(index);
              const prevX = index > 0 ? getNodeX(index - 1) : x;
              const league = getLeagueForIndex(index);
              const isLocked = status === 'locked';
              const isMastered = status === 'mastered';
              const isSelected = selectedNode === node.id;
              const def = getConceptById(node.id);

              const statusColor = {
                locked: 'var(--muted)',
                available: 'var(--cyan)',
                'in-progress': '#6b7cff',
                almost: '#fbbf24',
                mastered: '#ffd700',
              }[status];

              return (
                <div key={node.id} className="pmap-row">
                  {/* League section header */}
                  {index === league.startIndex && (
                    <motion.div
                      className="pmap-league-section"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      style={{ color: league.color, borderColor: league.color }}
                    >
                      {league.emoji} {league.label}
                    </motion.div>
                  )}

                  {/* Connector */}
                  {index > 0 && (
                    <div className="pmap-connector-row" style={{ left: `${Math.min(prevX, x)}%`, width: `${Math.abs(prevX - x) + 8}%` }}>
                      <div className={`pmap-connector-line ${isMastered ? 'done' : ''}`} />
                    </div>
                  )}

                  {/* Node */}
                  <div className="pmap-node-wrap" style={{ left: `${x}%` }}>
                    <motion.button
                      type="button"
                      className={`pmap-node ${status}`}
                      style={{
                        borderColor: isSelected ? 'white' : statusColor,
                        boxShadow: isSelected
                          ? `0 0 0 3px white, 0 0 30px ${statusColor}`
                          : isMastered
                          ? `0 0 20px rgba(255,215,0,0.4)`
                          : status === 'in-progress'
                          ? `0 0 18px rgba(107,124,255,0.3)`
                          : 'none',
                        opacity: isLocked ? 0.45 : 1,
                      }}
                      onClick={() => handleNodeClick(node.id, status)}
                      whileHover={!isLocked ? { scale: 1.1, y: -4 } : {}}
                      whileTap={!isLocked ? { scale: 0.95 } : {}}
                      animate={
                        status === 'available' ? { y: [0, -4, 0] } :
                        status === 'in-progress' ? { scale: [1, 1.02, 1] } : {}
                      }
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                      aria-label={`${node.title} — ${status}`}
                    >
                      <span className="pmap-node-emoji">{node.emoji}</span>
                      {isMastered && <span className="pmap-node-check">✓</span>}
                      {isLocked && <Lock size={12} className="pmap-node-lock" />}

                      {/* Pulsing ring for available */}
                      {status === 'available' && (
                        <motion.div
                          className="pmap-node-pulse"
                          animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          style={{ borderColor: statusColor }}
                        />
                      )}
                    </motion.button>

                    {/* Stars */}
                    {stars > 0 && <StarRow count={stars} />}

                    {/* Node label */}
                    <div className="pmap-node-label" style={{ color: isLocked ? 'var(--muted)' : statusColor }}>
                      {node.title}
                    </div>
                  </div>

                  {/* Expanded card */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        className="pmap-card"
                        style={{ left: x > 55 ? 'auto' : `${Math.min(x + 10, 55)}%`, right: x > 55 ? `${100 - x + 10}%` : 'auto' }}
                        initial={{ opacity: 0, scale: 0.85, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.85, y: 8 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                      >
                        <div className="pmap-card-header">
                          <span className="pmap-card-emoji">{node.emoji}</span>
                          <div>
                            <div className="pmap-card-title">{node.title}</div>
                            <div className="pmap-card-sub">{node.subtitle}</div>
                          </div>
                        </div>
                        {def?.description && (
                          <p className="pmap-card-desc">{def.description}</p>
                        )}
                        <div className="pmap-card-layers">
                          {(['intuitive', 'structural', 'precise'] as const).map((layer) => {
                            const snap = getConceptProgressSnapshot(studentName, node.id);
                            const layerStatus = snap?.layer_progress[layer] ?? 'untouched';
                            return (
                              <div key={layer} className={`pmap-card-layer ${layerStatus}`}>
                                <span>{layer === 'intuitive' ? '🌱' : layer === 'structural' ? '⚙️' : '💎'}</span>
                                <span style={{ textTransform: 'capitalize' }}>{layer}</span>
                                {layerStatus === 'completed' && <Check />}
                              </div>
                            );
                          })}
                        </div>
                        <motion.button
                          type="button"
                          className="pmap-card-cta"
                          onClick={() => handleStartConcept(node.id, node.title)}
                          whileHover={{ x: 3 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          {status === 'mastered' ? 'Replay' : status === 'in-progress' || status === 'almost' ? 'Continue' : 'Start'}
                          <ChevronRight size={15} />
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* End-of-path trophy */}
            <motion.div
              className="pmap-end-trophy"
              animate={{ y: [0, -8, 0], rotate: [0, 3, -3, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="pmap-end-trophy-icon">🏆</div>
              <div className="pmap-end-trophy-label">Master Engineer</div>
              <div className="pmap-end-trophy-sub">Complete all concepts to earn this title</div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ─── Chest reward modal ─── */}
      <AnimatePresence>
        {activeChest && (
          <ChestReward
            chest={activeChest.def}
            sparksAwarded={activeChest.result.sparksAwarded}
            bonusItemId={activeChest.result.bonusItemId}
            onClose={() => { setActiveChest(null); setSparks(getSparks(studentName)); }}
          />
        )}
      </AnimatePresence>

      {/* ─── Avatar shop ─── */}
      <AnimatePresence>
        {showShop && (
          <AvatarShop
            studentName={studentName}
            onClose={() => setShowShop(false)}
            onPurchase={() => setSparks(getSparks(studentName))}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Re-export for convenience
function Check() {
  return <span style={{ marginLeft: 'auto', color: 'var(--green)', fontSize: '0.7rem' }}>✓</span>;
}
