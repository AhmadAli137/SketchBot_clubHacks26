'use client';

import { useEffect, useState } from 'react';
import { X, ArrowRight } from 'lucide-react';

import { getConceptMapNodes } from '@/lib/concept-catalog';
import type { AgeGroup } from '@/lib/concept-types';
import { getConceptProgressSnapshot, getNodeStatus } from '@/lib/progress-store';

const CONCEPT_NODES = getConceptMapNodes();

type ConceptMapProps = {
  studentName: string;
  ageGroup: AgeGroup;
  onConceptSelect: (conceptId: string, conceptTitle: string) => void;
  onClose: () => void;
};

type NodeStatus = 'locked' | 'available' | 'touched' | 'mastered';

const STATUS_STYLES: Record<NodeStatus, { border: string; glow: string; badge: string; labelColor: string }> = {
  locked: { border: 'var(--border)', glow: 'none', badge: 'Locked', labelColor: 'var(--muted)' },
  available: { border: 'rgba(93,228,255,0.3)', glow: 'none', badge: 'New', labelColor: 'var(--text)' },
  touched: { border: 'rgba(59,130,246,0.6)', glow: '0 0 18px rgba(59,130,246,0.25)', badge: 'In progress', labelColor: 'var(--cyan)' },
  mastered: { border: 'rgba(245,158,11,0.8)', glow: '0 0 22px rgba(245,158,11,0.3)', badge: 'Mastered', labelColor: '#f59e0b' },
};

function formatAgeGroup(ageGroup: AgeGroup): string {
  if (ageGroup === 'explorer') {
    return 'Explorer';
  }
  if (ageGroup === 'builder') {
    return 'Builder';
  }
  return 'Engineer';
}

export function ConceptMap({ studentName, ageGroup, onConceptSelect, onClose }: ConceptMapProps) {
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const statuses: Record<string, NodeStatus> = {};
    const rawStatuses: Record<string, 'locked' | 'touched' | 'mastered'> = {};

    CONCEPT_NODES.forEach((node) => {
      rawStatuses[node.id] = getNodeStatus(studentName, node.id);
    });

    CONCEPT_NODES.forEach((node) => {
      const rawStatus = rawStatuses[node.id];
      if (rawStatus === 'touched' || rawStatus === 'mastered') {
        statuses[node.id] = rawStatus;
        return;
      }

      const prerequisitesMet = node.prerequisites.every((prerequisiteId) => {
        return rawStatuses[prerequisiteId] === 'touched' || rawStatuses[prerequisiteId] === 'mastered';
      });

      statuses[node.id] = prerequisitesMet ? 'available' : 'locked';
    });

    setNodeStatuses(statuses);
  }, [studentName]);

  const selectedNode = selected ? CONCEPT_NODES.find((node) => node.id === selected) ?? null : null;
  const selectedStatus = selected ? nodeStatuses[selected] : null;
  const selectedProgress = selected ? getConceptProgressSnapshot(studentName, selected) : null;

  return (
    <div className="concept-map-overlay">
      <div className="concept-map-shell">
        <div className="concept-map-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>Knowledge Map</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
              {studentName}&rsquo;s learning journey - {formatAgeGroup(ageGroup)}
            </div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['available', 'touched', 'mastered'] as NodeStatus[]).map((status) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'var(--muted)' }}>
                  <span style={{ fontWeight: 700 }}>{STATUS_STYLES[status].badge}</span>
                </div>
              ))}
            </div>
            <button type="button" className="btn-ghost" style={{ padding: '6px 8px', minHeight: 'unset' }} onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="concept-map-canvas">
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {CONCEPT_NODES.flatMap((node) =>
              node.prerequisites.map((prerequisiteId) => {
                const prerequisiteNode = CONCEPT_NODES.find((candidate) => candidate.id === prerequisiteId);
                if (!prerequisiteNode) {
                  return null;
                }

                const status = nodeStatuses[node.id];
                const opacity = status === 'locked' ? 0.15 : 0.35;

                return (
                  <line
                    key={`${prerequisiteId}-${node.id}`}
                    x1={prerequisiteNode.x}
                    y1={prerequisiteNode.y}
                    x2={node.x}
                    y2={node.y}
                    stroke={status === 'mastered' ? '#f59e0b' : status === 'touched' ? '#3b82f6' : 'var(--muted)'}
                    strokeWidth="0.4"
                    strokeDasharray={status === 'locked' ? '1.5 1.5' : 'none'}
                    opacity={opacity}
                  />
                );
              }),
            )}
          </svg>

          {CONCEPT_NODES.map((node) => {
            const status = nodeStatuses[node.id] ?? 'available';
            const styles = STATUS_STYLES[status];
            const isHovered = hovered === node.id;
            const isSelected = selected === node.id;
            const isLocked = status === 'locked';

            return (
              <button
                key={node.id}
                type="button"
                className="concept-map-node"
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  transform: 'translate(-50%, -50%)',
                  borderColor: isSelected ? 'var(--cyan)' : styles.border,
                  boxShadow: isSelected
                    ? '0 0 0 2px var(--cyan), 0 0 24px rgba(93,228,255,0.25)'
                    : isHovered && !isLocked
                      ? '0 0 20px rgba(93,228,255,0.18)'
                      : styles.glow,
                  opacity: isLocked ? 0.45 : 1,
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                  scale: isHovered && !isLocked ? '1.06' : '1',
                }}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => {
                  if (!isLocked) {
                    setSelected(selected === node.id ? null : node.id);
                  }
                }}
              >
                <span className="concept-node-emoji">{node.emoji}</span>
                <span className="concept-node-title" style={{ color: styles.labelColor }}>
                  {node.title}
                </span>
                <span className="concept-node-sub">{node.subtitle}</span>
                {status !== 'available' && (
                  <span
                    className="concept-node-badge"
                    style={{
                      color: status === 'mastered' ? '#f59e0b' : status === 'touched' ? '#3b82f6' : 'var(--muted)',
                    }}
                  >
                    {styles.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedNode && (
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
                    {selectedStatus === 'touched' ? 'Continue' : 'Explore'}
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>

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
                          state === 'completed'
                            ? 'var(--green)'
                            : state === 'started'
                              ? 'var(--cyan)'
                              : 'var(--muted)',
                        textTransform: 'capitalize',
                        fontWeight: 600,
                      }}
                    >
                      {layer} · {state}
                    </span>
                  );
                })}
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                  }}
                >
                  Highest: {selectedProgress.highest_layer_reached}
                </span>
              </div>
            )}

            {selectedNode.prerequisites.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>Requires:</span>
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
