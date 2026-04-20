'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, ArrowRight, Lock, Star, Trophy, Flame, Target } from 'lucide-react';

import { getConceptById, getConceptMapNodes, ROBOT_LAB_CONCEPT_IDS } from '@/lib/concept-catalog';
import { getPathOrderedNodes } from '@/lib/learning-path-order';
import type { AgeGroup } from '@/lib/concept-types';
import {
  BADGE_DEFINITIONS,
  getConceptProgressSnapshot,
  getNodeStatus,
  getProgressSummary,
  getStudentXPInfo,
  getStudentProgress,
} from '@/lib/progress-store';

const CONCEPT_NODES = getConceptMapNodes();
const ORDERED_PATH = getPathOrderedNodes(CONCEPT_NODES);

const LAYER_LEVEL_GATES: Record<string, number> = {
  structural: 3,
  precise: 5,
};

type ConceptMapProps = {
  studentName: string;
  ageGroup: AgeGroup;
  onConceptSelect: (conceptId: string, conceptTitle: string) => void;
  onClose: () => void;
  /** Which tab opens first (e.g. home “Stats” button). */
  initialTab?: 'path' | 'stats';
};

type NodeStatus = 'locked' | 'available' | 'touched' | 'almost-mastered' | 'mastered';

const STATUS_STYLES: Record<NodeStatus, { border: string; glow: string; badge: string; labelColor: string }> = {
  locked: { border: 'var(--border)', glow: 'none', badge: 'Locked', labelColor: 'var(--muted)' },
  available: { border: 'rgba(93,228,255,0.3)', glow: 'none', badge: 'Start', labelColor: 'var(--text)' },
  touched: { border: 'rgba(59,130,246,0.6)', glow: '0 0 18px rgba(59,130,246,0.25)', badge: 'In progress', labelColor: 'var(--cyan)' },
  'almost-mastered': { border: 'rgba(245,158,11,0.6)', glow: '0 0 24px rgba(245,158,11,0.35)', badge: 'Almost there!', labelColor: '#f59e0b' },
  mastered: { border: 'rgba(245,158,11,0.8)', glow: '0 0 22px rgba(245,158,11,0.3)', badge: 'Mastered', labelColor: '#f59e0b' },
};

function formatAgeGroup(ageGroup: AgeGroup): string {
  if (ageGroup === 'explorer') return 'Explorer';
  if (ageGroup === 'builder') return 'Builder';
  return 'Engineer';
}

function layerRingProgress(snapshot: ReturnType<typeof getConceptProgressSnapshot> | null): number {
  if (!snapshot) return 0;
  const done = (['intuitive', 'structural', 'precise'] as const).filter((l) => snapshot.layer_progress[l] === 'completed').length;
  return done / 3;
}

export function ConceptMap({ studentName, ageGroup, onConceptSelect, onClose, initialTab = 'path' }: ConceptMapProps) {
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [studentLevel, setStudentLevel] = useState(1);
  const [tab, setTab] = useState<'path' | 'stats'>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    getStudentProgress(studentName, ageGroup);
  }, [studentName, ageGroup]);

  useEffect(() => {
    const xpInfo = getStudentXPInfo(studentName);
    if (xpInfo) setStudentLevel(xpInfo.level);

    const statuses: Record<string, NodeStatus> = {};
    const rawStatuses: Record<string, 'locked' | 'touched' | 'mastered'> = {};

    CONCEPT_NODES.forEach((node) => {
      rawStatuses[node.id] = getNodeStatus(studentName, node.id);
    });

    CONCEPT_NODES.forEach((node) => {
      const rawStatus = rawStatuses[node.id];
      if (rawStatus === 'mastered') {
        statuses[node.id] = 'mastered';
        return;
      }
      if (rawStatus === 'touched') {
        const snapshot = getConceptProgressSnapshot(studentName, node.id);
        const completedLayers = snapshot
          ? (['intuitive', 'structural', 'precise'] as const).filter((l) => snapshot.layer_progress[l] === 'completed').length
          : 0;
        statuses[node.id] = completedLayers >= 2 ? 'almost-mastered' : 'touched';
        return;
      }

      const prerequisitesMet = node.prerequisites.every((prerequisiteId) => {
        return rawStatuses[prerequisiteId] === 'touched' || rawStatuses[prerequisiteId] === 'mastered';
      });

      statuses[node.id] = prerequisitesMet ? 'available' : 'locked';
    });

    setNodeStatuses(statuses);
  }, [studentName]);

  const summary = useMemo(() => getProgressSummary(studentName), [studentName]);
  const selectedNode = selected ? CONCEPT_NODES.find((node) => node.id === selected) ?? null : null;
  const selectedStatus = selected ? nodeStatuses[selected] : null;
  const selectedProgress = selected ? getConceptProgressSnapshot(studentName, selected) : null;
  const selectedConceptDef = selectedNode ? getConceptById(selectedNode.id) : null;

  return (
    <div className="concept-map-overlay">
      <div className="concept-map-shell concept-map-shell--journey">
        <div className="concept-map-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>Your learning journey</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
              {studentName}&rsquo;s progress · {formatAgeGroup(ageGroup)}
            </div>
          </div>

          <div className="journey-tab-row" role="tablist" aria-label="Journey sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'path'}
              className={`journey-tab ${tab === 'path' ? 'active' : ''}`}
              onClick={() => setTab('path')}
            >
              <Target size={14} />
              Path
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'stats'}
              className={`journey-tab ${tab === 'stats' ? 'active' : ''}`}
              onClick={() => setTab('stats')}
            >
              <Trophy size={14} />
              Stats
            </button>
            <button type="button" className="btn-ghost journey-close" style={{ padding: '6px 8px', minHeight: 'unset' }} onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {tab === 'stats' && !summary && (
          <div className="journey-stats-panel journey-stats-fallback">
            <p>Play a session to start tracking XP, streaks, and badges.</p>
          </div>
        )}

        {tab === 'stats' && summary && (
          <div className="journey-stats-panel">
            <div className="journey-stats-hero">
              <div className="journey-stats-badge-big" aria-hidden>
                {summary.levelEmoji}
              </div>
              <div className="journey-stats-xp-block">
                <div className="journey-stats-title">
                  Lv.{summary.level} {summary.levelName}
                </div>
                <div className="journey-stats-xp-big">{summary.xp} XP</div>
                <div className="journey-stats-xp-track">
                  <div className="journey-stats-xp-fill" style={{ width: `${Math.round(summary.progress * 100)}%` }} />
                </div>
                <div className="journey-stats-xp-sub">
                  {summary.level >= 12
                    ? 'Max level reached — keep earning badges!'
                    : `${Math.max(0, summary.nextXP - summary.xp)} XP to level ${summary.level + 1}`}
                </div>
              </div>
            </div>

            <div className="journey-stats-grid">
              <div className="journey-stat-card">
                <Flame size={18} className="journey-stat-ic" />
                <strong>{summary.streak.current_streak_days}</strong>
                <span>Day streak</span>
              </div>
              <div className="journey-stat-card">
                <span className="journey-stat-emoji">✏️</span>
                <strong>{summary.drawingCount}</strong>
                <span>Drawings saved</span>
              </div>
              <div className="journey-stat-card">
                <span className="journey-stat-emoji">📚</span>
                <strong>{summary.totalSessions}</strong>
                <span>Sessions</span>
              </div>
              <div className="journey-stat-card">
                <span className="journey-stat-emoji">🎯</span>
                <strong>{summary.conceptsMastered}</strong>
                <span>Concepts mastered</span>
              </div>
            </div>

            <div className="journey-badges-section">
              <h3 className="journey-badges-heading">Badges ({summary.badges.length})</h3>
              <div className="journey-badges-grid">
                {summary.badges.map((id) => {
                  const def = BADGE_DEFINITIONS[id];
                  if (!def) {
                    return (
                      <div key={id} className="journey-badge-chip">
                        <span>🏅</span> {id}
                      </div>
                    );
                  }
                  return (
                    <div key={id} className="journey-badge-chip earned" title={def.description}>
                      <span>{def.emoji}</span>
                      <span className="journey-badge-name">{def.name}</span>
                    </div>
                  );
                })}
                {summary.badges.length === 0 && (
                  <p className="journey-badges-empty">Complete lessons and challenges to earn your first badges.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'path' && (
          <div className="learning-path-duo">
            <p className="learning-path-hint">Follow the path — finish lessons in order, or jump ahead when a unit unlocks.</p>
            <div className="learning-path-spine">
              {ORDERED_PATH.map((node, index) => {
                const status = nodeStatuses[node.id] ?? 'available';
                const styles = STATUS_STYLES[status];
                const isLocked = status === 'locked';
                const snapshot =
                  status === 'touched' || status === 'almost-mastered' ? getConceptProgressSnapshot(studentName, node.id) : null;
                const ring = layerRingProgress(snapshot);
                const isHovered = hovered === node.id;
                const isSelected = selected === node.id;

                const nextUncompletedLayer = snapshot
                  ? (['intuitive', 'structural', 'precise'] as const).find((l) => snapshot.layer_progress[l] !== 'completed')
                  : null;
                const gateLevel = nextUncompletedLayer ? LAYER_LEVEL_GATES[nextUncompletedLayer] : undefined;
                const isLevelGated = gateLevel !== undefined && studentLevel < gateLevel;
                const isRobotLab = (ROBOT_LAB_CONCEPT_IDS as readonly string[]).includes(node.id);

                return (
                  <div key={node.id} className="learning-path-row">
                    <div className="learning-path-rail">
                      <div className={`learning-path-node-wrap ${status === 'mastered' ? 'is-done' : ''}`}>
                        <button
                          type="button"
                          className={`learning-path-node ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''} ${isRobotLab ? 'learning-path-node--robot-lab' : ''}`}
                          style={{
                            borderColor: isSelected ? 'var(--cyan)' : styles.border,
                            boxShadow: isSelected ? '0 0 0 2px var(--cyan)' : isHovered && !isLocked ? styles.glow : undefined,
                            opacity: isLocked ? 0.5 : 1,
                          }}
                          onMouseEnter={() => setHovered(node.id)}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => {
                            if (!isLocked) setSelected(selected === node.id ? null : node.id);
                          }}
                          aria-label={`${node.title} — ${styles.badge}`}
                        >
                          <span className="learning-path-node-emoji" aria-hidden>
                            {node.emoji}
                          </span>
                          {status === 'mastered' && (
                            <span className="learning-path-check" aria-hidden>
                              ✓
                            </span>
                          )}
                          <svg className="learning-path-ring" viewBox="0 0 36 36" aria-hidden>
                            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                            <circle
                              cx="18"
                              cy="18"
                              r="15"
                              fill="none"
                              stroke="var(--cyan)"
                              strokeWidth="3"
                              strokeDasharray={`${ring * 94.2} 94.2`}
                              strokeLinecap="round"
                              transform="rotate(-90 18 18)"
                              opacity={ring > 0 ? 0.9 : 0.25}
                            />
                          </svg>
                        </button>
                      </div>
                      {index < ORDERED_PATH.length - 1 && <div className={`learning-path-connector ${status === 'mastered' ? 'done' : ''}`} />}
                    </div>

                    <div className="learning-path-body">
                      <div className="learning-path-title-row">
                        <span className="learning-path-title" style={{ color: styles.labelColor }}>
                          {node.title}
                        </span>
                        {status !== 'available' && (
                          <span className="learning-path-badge" style={{ color: styles.labelColor }}>
                            {styles.badge}
                          </span>
                        )}
                        {isLocked && (
                          <span className="learning-path-lock">
                            <Lock size={12} />
                          </span>
                        )}
                      </div>
                      <div className="learning-path-sub">{node.subtitle}</div>
                      {isLevelGated && !isLocked && (
                        <div className="learning-path-gate">Reach Lv.{gateLevel} for the next layer</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedNode && tab === 'path' && (
          <div className="concept-map-detail">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.6rem' }}>{selectedNode.emoji}</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem' }}>{selectedNode.title}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.74rem' }}>{selectedNode.subtitle}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 999,
                    border: `1px solid ${selectedStatus ? STATUS_STYLES[selectedStatus].border : 'var(--border)'}`,
                    color: selectedStatus ? STATUS_STYLES[selectedStatus].labelColor : 'var(--muted)',
                    textTransform: 'capitalize',
                  }}
                >
                  {selectedStatus ? STATUS_STYLES[selectedStatus].badge : 'Unavailable'}
                </span>
                {selectedStatus && selectedStatus !== 'locked' && (
                  <button
                    type="button"
                    className="btn-cta"
                    style={{ minHeight: 34, fontSize: '0.8rem', gap: 6 }}
                    onClick={() => {
                      onConceptSelect(selectedNode.id, selectedNode.title);
                      onClose();
                    }}
                  >
                    {selectedStatus === 'touched' || selectedStatus === 'almost-mastered' ? 'Continue' : 'Start'}
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>

            {selectedConceptDef?.description && (
              <p className="concept-map-detail-blurb">{selectedConceptDef.description}</p>
            )}

            {selectedProgress && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                {(['intuitive', 'structural', 'precise'] as const).map((layer) => {
                  const state = selectedProgress.layer_progress[layer];
                  return (
                    <span
                      key={layer}
                      style={{
                        fontSize: '0.68rem',
                        padding: '3px 8px',
                        borderRadius: 999,
                        border: `1px solid ${
                          state === 'completed'
                            ? 'rgba(77,255,184,0.32)'
                            : state === 'started'
                              ? 'rgba(93,228,255,0.28)'
                              : 'var(--border)'
                        }`,
                        background:
                          state === 'completed'
                            ? 'rgba(77,255,184,0.08)'
                            : state === 'started'
                              ? 'rgba(93,228,255,0.06)'
                              : 'rgba(255,255,255,0.03)',
                        color:
                          state === 'completed' ? 'var(--green)' : state === 'started' ? 'var(--cyan)' : 'var(--muted)',
                        textTransform: 'capitalize',
                        fontWeight: 600,
                      }}
                    >
                      {layer} · {state}
                    </span>
                  );
                })}
              </div>
            )}

            {selectedStatus === 'touched' || selectedStatus === 'almost-mastered' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                {(() => {
                  const nextLayer = selectedProgress
                    ? (['intuitive', 'structural', 'precise'] as const).find((l) => selectedProgress.layer_progress[l] !== 'completed')
                    : null;
                  const gate = nextLayer ? LAYER_LEVEL_GATES[nextLayer] : undefined;
                  if (!gate) return null;
                  return studentLevel >= gate ? (
                    <span style={{ fontSize: '0.68rem', color: 'var(--green)', fontWeight: 700 }}>
                      <Star size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                      You&rsquo;re ready for the {nextLayer} layer!
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                      Reach Lv.{gate} to unlock the recommended {nextLayer} path
                    </span>
                  );
                })()}
              </div>
            ) : null}

            {selectedNode.prerequisites.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>Unlocks after:</span>
                {selectedNode.prerequisites.map((prerequisiteId) => {
                  const prerequisiteNode = CONCEPT_NODES.find((candidate) => candidate.id === prerequisiteId);
                  const prerequisiteStatus = nodeStatuses[prerequisiteId];
                  if (!prerequisiteNode) {
                    return null;
                  }

                  return (
                    <span
                      key={prerequisiteId}
                      style={{
                        fontSize: '0.68rem',
                        padding: '2px 8px',
                        borderRadius: 999,
                        background:
                          prerequisiteStatus === 'mastered' ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${
                          prerequisiteStatus === 'mastered' ? 'rgba(245,158,11,0.3)' : 'var(--border)'
                        }`,
                        color: prerequisiteStatus === 'mastered' ? '#f59e0b' : 'var(--muted)',
                      }}
                    >
                      {prerequisiteNode.emoji} {prerequisiteNode.title}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
