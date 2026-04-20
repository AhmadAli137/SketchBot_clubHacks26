'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUp, GripVertical, Play, Plus, Trash2, Wand2 } from 'lucide-react';

import { getConceptStructuralStarter } from '@/lib/concept-catalog';

export type BlockType =
  | 'move_to'
  | 'move_relative'
  | 'draw_shape'
  | 'pen_up'
  | 'pen_down'
  | 'repeat'
  | 'set_speed'
  | 'draw_line';

type BlockParam = {
  name: string;
  label: string;
  type: 'number' | 'select';
  default: string | number;
  options?: string[];
  unit?: string;
};

type BlockDef = {
  type: BlockType;
  label: string;
  color: string;
  emoji: string;
  description: string;
  params: BlockParam[];
};

type BlockInstance = {
  id: string;
  type: BlockType;
  params: Record<string, string | number>;
  body?: BlockInstance[];
};

export type BlockProgramNode = {
  type: BlockType;
  params: Record<string, string | number>;
  body?: BlockProgramNode[];
};

export type BlockProgram = {
  blocks: BlockProgramNode[];
};

type BlockEditorProps = {
  conceptId?: string | null;
  onRunProgram: (program: BlockProgram) => void | Promise<void>;
  isRunning?: boolean;
  onPreviewSvgChange?: (svg: string | null) => void;
};

const BLOCK_DEFS: BlockDef[] = [
  {
    type: 'move_to',
    label: 'Move To',
    color: '#3b82f6',
    emoji: 'Pin',
    description: 'Move the pen to an exact X/Y coordinate.',
    params: [
      { name: 'x', label: 'X', type: 'number', default: 100, unit: 'mm' },
      { name: 'y', label: 'Y', type: 'number', default: 100, unit: 'mm' },
    ],
  },
  {
    type: 'move_relative',
    label: 'Move By',
    color: '#8b5cf6',
    emoji: 'Step',
    description: 'Shift from the current position by an offset.',
    params: [
      { name: 'dx', label: 'dX', type: 'number', default: 50, unit: 'mm' },
      { name: 'dy', label: 'dY', type: 'number', default: 0, unit: 'mm' },
    ],
  },
  {
    type: 'draw_shape',
    label: 'Draw Shape',
    color: '#f59e0b',
    emoji: 'Shape',
    description: 'Drop in a regular geometric shape.',
    params: [
      {
        name: 'shape',
        label: 'Shape',
        type: 'select',
        default: 'square',
        options: ['square', 'circle', 'triangle', 'star', 'hexagon'],
      },
      { name: 'size', label: 'Size', type: 'number', default: 60, unit: 'mm' },
    ],
  },
  {
    type: 'draw_line',
    label: 'Draw Line',
    color: '#10b981',
    emoji: 'Line',
    description: 'Draw a straight line in a cardinal direction.',
    params: [
      { name: 'length', label: 'Length', type: 'number', default: 80, unit: 'mm' },
      {
        name: 'direction',
        label: 'Direction',
        type: 'select',
        default: 'right',
        options: ['right', 'up', 'left', 'down'],
      },
    ],
  },
  {
    type: 'pen_up',
    label: 'Pen Up',
    color: '#ef4444',
    emoji: 'Up',
    description: 'Lift the pen before moving.',
    params: [],
  },
  {
    type: 'pen_down',
    label: 'Pen Down',
    color: '#22c55e',
    emoji: 'Down',
    description: 'Lower the pen to start drawing.',
    params: [],
  },
  {
    type: 'repeat',
    label: 'Repeat',
    color: '#ec4899',
    emoji: 'Loop',
    description: 'Repeat the next instruction a set number of times.',
    params: [{ name: 'times', label: 'Times', type: 'number', default: 4 }],
  },
  {
    type: 'set_speed',
    label: 'Set Speed',
    color: '#64748b',
    emoji: 'Speed',
    description: 'Choose how quickly the robot draws.',
    params: [
      {
        name: 'speed',
        label: 'Speed',
        type: 'select',
        default: 'normal',
        options: ['slow', 'normal', 'fast'],
      },
    ],
  },
];

const STARTER_PROGRAMS: Record<string, Array<{ type: BlockType; params?: Record<string, string | number> }>> = {
  move_to_coordinates: [
    { type: 'pen_up' },
    { type: 'move_to', params: { x: 50, y: 50 } },
    { type: 'pen_down' },
    { type: 'draw_line', params: { length: 100, direction: 'right' } },
    { type: 'draw_line', params: { length: 100, direction: 'up' } },
    { type: 'draw_line', params: { length: 100, direction: 'left' } },
    { type: 'draw_line', params: { length: 100, direction: 'down' } },
  ],
  curve_through_points: [
    { type: 'set_speed', params: { speed: 'slow' } },
    { type: 'move_to', params: { x: 30, y: 105 } },
    { type: 'draw_shape', params: { shape: 'circle', size: 18 } },
    { type: 'move_relative', params: { dx: 45, dy: -35 } },
    { type: 'move_relative', params: { dx: 60, dy: 70 } },
    { type: 'move_relative', params: { dx: 70, dy: -55 } },
  ],
  parametric_shape: [
    { type: 'move_to', params: { x: 148, y: 105 } },
    { type: 'draw_shape', params: { shape: 'hexagon', size: 80 } },
    { type: 'draw_shape', params: { shape: 'star', size: 55 } },
  ],
  tag_detection_overlay: [
    { type: 'move_to', params: { x: 30, y: 30 } },
    { type: 'draw_shape', params: { shape: 'square', size: 22 } },
    { type: 'move_to', params: { x: 267, y: 30 } },
    { type: 'draw_shape', params: { shape: 'square', size: 22 } },
    { type: 'move_to', params: { x: 267, y: 180 } },
    { type: 'draw_shape', params: { shape: 'square', size: 22 } },
    { type: 'move_to', params: { x: 30, y: 180 } },
    { type: 'draw_shape', params: { shape: 'square', size: 22 } },
  ],
  pid_sliders: [
    { type: 'set_speed', params: { speed: 'slow' } },
    { type: 'move_to', params: { x: 40, y: 105 } },
    { type: 'draw_line', params: { length: 220, direction: 'right' } },
  ],
  challenge_builder: [
    { type: 'move_to', params: { x: 80, y: 60 } },
    { type: 'draw_shape', params: { shape: 'triangle', size: 60 } },
    { type: 'move_relative', params: { dx: 100, dy: 30 } },
    { type: 'draw_shape', params: { shape: 'circle', size: 40 } },
  ],
  parametric_curve: [
    { type: 'set_speed', params: { speed: 'normal' } },
    { type: 'move_to', params: { x: 35, y: 105 } },
    { type: 'move_relative', params: { dx: 40, dy: 35 } },
    { type: 'move_relative', params: { dx: 40, dy: -35 } },
    { type: 'move_relative', params: { dx: 40, dy: 35 } },
    { type: 'move_relative', params: { dx: 40, dy: -35 } },
    { type: 'move_relative', params: { dx: 40, dy: 35 } },
  ],
};

const CANVAS_W = 297;
const CANVAS_H = 210;

let idCounter = 0;

function newId(): string {
  idCounter += 1;
  return `blk-${Date.now()}-${idCounter}`;
}

function getDefForType(type: BlockType): BlockDef {
  const definition = BLOCK_DEFS.find((candidate) => candidate.type === type);
  if (!definition) {
    throw new Error(`Unknown block type: ${type}`);
  }
  return definition;
}

function createBlock(type: BlockType, overrides?: Record<string, string | number>): BlockInstance {
  const definition = getDefForType(type);
  const params: Record<string, string | number> = {};
  definition.params.forEach((param) => {
    params[param.name] = overrides?.[param.name] ?? param.default;
  });

  return {
    id: newId(),
    type,
    params,
    body: type === 'repeat' ? [] : undefined,
  };
}

function loadStarterProgram(templateName?: string): BlockInstance[] {
  if (!templateName || !STARTER_PROGRAMS[templateName]) {
    return [];
  }

  return STARTER_PROGRAMS[templateName].map((step) => createBlock(step.type, step.params));
}

function describeBlock(block: BlockInstance): string {
  const params = block.params;
  switch (block.type) {
    case 'move_to':
      return `move to (${params.x}mm, ${params.y}mm)`;
    case 'move_relative':
      return `move by dX=${params.dx}mm and dY=${params.dy}mm`;
    case 'draw_shape':
      return `draw a ${params.shape} about ${params.size}mm wide`;
    case 'draw_line':
      return `draw a ${params.length}mm line going ${params.direction}`;
    case 'pen_up':
      return 'lift the pen';
    case 'pen_down':
      return 'lower the pen';
    case 'repeat':
      return `repeat the next instruction ${params.times} times`;
    case 'set_speed':
      return `set drawing speed to ${params.speed}`;
    default:
      return 'unknown block';
  }
}

function compileProgram(blocks: BlockInstance[]): BlockProgram {
  const serializeBlock = (block: BlockInstance): BlockProgramNode => ({
    type: block.type,
    params: { ...block.params },
    ...(block.body && block.body.length > 0
      ? { body: block.body.map((child) => serializeBlock(child)) }
      : {}),
  });

  return {
    blocks: blocks.map((block) => serializeBlock(block)),
  };
}

function buildProgramOutline(blocks: BlockInstance[]): string[] {
  const lines: string[] = [];

  const appendLines = (items: BlockInstance[], depth = 0) => {
    items.forEach((block, index) => {
      lines.push(`${'  '.repeat(depth)}${index + 1}. ${describeBlock(block)}`);
      if (block.body?.length) {
        appendLines(block.body, depth + 1);
      }
    });
  };

  appendLines(blocks);
  return lines;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

function toNumber(value: string | number | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function drawShapePath(shape: string, size: number, centerX: number, centerY: number): string {
  const radius = Math.max(4, size / 2);
  const buildPolygon = (sides: number, rotationDeg = -90) => {
    const points = Array.from({ length: sides + 1 }, (_, index) => {
      const angle = ((rotationDeg + (index * 360) / sides) * Math.PI) / 180;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return points;
  };

  if (shape === 'circle') {
    return Array.from({ length: 37 }, (_, index) => {
      const angle = ((-90 + index * 10) * Math.PI) / 180;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
  }

  if (shape === 'triangle') {
    return buildPolygon(3).join(' ');
  }

  if (shape === 'hexagon') {
    return buildPolygon(6).join(' ');
  }

  if (shape === 'star') {
    const points = Array.from({ length: 11 }, (_, index) => {
      const angle = ((-90 + index * 36) * Math.PI) / 180;
      const currentRadius = index % 2 === 0 ? radius : radius * 0.45;
      const x = centerX + currentRadius * Math.cos(angle);
      const y = centerY + currentRadius * Math.sin(angle);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return points.join(' ');
  }

  return buildPolygon(4, 45).join(' ');
}

function createPreviewSvg(program: BlockProgram): string | null {
  if (program.blocks.length === 0) {
    return null;
  }

  let x = CANVAS_W / 2;
  let y = CANVAS_H / 2;
  let penDown = true;
  const paths: string[] = [];

  const drawLine = (length: number, direction: string) => {
    let nextX = x;
    let nextY = y;
    if (direction === 'up') {
      nextY += length;
    } else if (direction === 'left') {
      nextX -= length;
    } else if (direction === 'down') {
      nextY -= length;
    } else {
      nextX += length;
    }
    nextX = clamp(nextX, 0, CANVAS_W);
    nextY = clamp(nextY, 0, CANVAS_H);
    if (penDown) {
      paths.push(`<path d="M ${x.toFixed(2)} ${CANVAS_H - y} L ${nextX.toFixed(2)} ${(CANVAS_H - nextY).toFixed(2)}" fill="none" stroke="#5de4ff" stroke-width="2" stroke-linecap="round" />`);
    }
    x = nextX;
    y = nextY;
  };

  const executeBlock = (block: BlockProgramNode) => {
    if (block.type === 'move_to') {
      x = clamp(toNumber(block.params.x, x), 0, CANVAS_W);
      y = clamp(toNumber(block.params.y, y), 0, CANVAS_H);
      return;
    }
    if (block.type === 'move_relative') {
      x = clamp(x + toNumber(block.params.dx), 0, CANVAS_W);
      y = clamp(y + toNumber(block.params.dy), 0, CANVAS_H);
      return;
    }
    if (block.type === 'draw_line') {
      drawLine(Math.max(1, toNumber(block.params.length, 80)), String(block.params.direction || 'right'));
      return;
    }
    if (block.type === 'draw_shape') {
      const shape = String(block.params.shape || 'square');
      const size = Math.max(8, toNumber(block.params.size, 60));
      const points = drawShapePath(shape, size, x, CANVAS_H - y);
      paths.push(`<polyline points="${points}" fill="none" stroke="#ffb84d" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`);
      return;
    }
    if (block.type === 'pen_up') {
      penDown = false;
      return;
    }
    if (block.type === 'pen_down') {
      penDown = true;
      return;
    }
    if (block.type === 'repeat' && block.body?.length) {
      const times = Math.max(1, toNumber(block.params.times, 1));
      for (let repeatIndex = 0; repeatIndex < times; repeatIndex += 1) {
        block.body.forEach((nestedBlock) => executeBlock(nestedBlock));
      }
    }
  };

  program.blocks.forEach((block) => executeBlock(block));

  if (paths.length === 0) {
    return null;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" preserveAspectRatio="xMidYMid meet"><rect width="${CANVAS_W}" height="${CANVAS_H}" rx="14" fill="rgba(4,10,24,0.88)" stroke="rgba(93,228,255,0.18)" /><path d="M 0 ${CANVAS_H / 2} H ${CANVAS_W}" stroke="rgba(255,255,255,0.05)" /><path d="M ${CANVAS_W / 2} 0 V ${CANVAS_H}" stroke="rgba(255,255,255,0.05)" />${paths.join('')}</svg>`;
}

export function BlockEditor({ conceptId, onRunProgram, isRunning = false, onPreviewSvgChange }: BlockEditorProps) {
  const [script, setScript] = useState<BlockInstance[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const conceptStarter = useMemo(() => getConceptStructuralStarter(conceptId), [conceptId]);
  const storageKey = useMemo(() => `sketchbot:block-program:${conceptId ?? 'free-draw'}`, [conceptId]);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as BlockInstance[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setScript(parsed);
          return;
        }
      } catch {
        // Ignore corrupt block history and fall back to concept starter.
      }
    }

    if (conceptStarter?.blockTemplate) {
      setScript(loadStarterProgram(conceptStarter.blockTemplate));
      return;
    }

    setScript([]);
  }, [conceptStarter?.blockTemplate, storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(script));
  }, [script, storageKey]);

  const compiledProgram = useMemo(() => compileProgram(script), [script]);
  const outline = useMemo(() => buildProgramOutline(script), [script]);
  const previewSvg = useMemo(() => createPreviewSvg(compiledProgram), [compiledProgram]);

  useEffect(() => {
    onPreviewSvgChange?.(previewSvg);
  }, [onPreviewSvgChange, previewSvg]);

  const addBlock = (type: BlockType) => {
    setScript((current) => [...current, createBlock(type)]);
    setPaletteOpen(false);
  };

  const updateNestedBlocks = (
    blocks: BlockInstance[],
    parentId: string,
    updater: (body: BlockInstance[]) => BlockInstance[],
  ): BlockInstance[] =>
    blocks.map((block) => {
      if (block.id === parentId && block.type === 'repeat') {
        return {
          ...block,
          body: updater(block.body ?? []),
        };
      }
      if (block.body?.length) {
        return {
          ...block,
          body: updateNestedBlocks(block.body, parentId, updater),
        };
      }
      return block;
    });

  const removeBlock = (id: string) => {
    setScript((current) => current.filter((block) => block.id !== id));
  };

  const addNestedBlock = (parentId: string, type: BlockType) => {
    setScript((current) => updateNestedBlocks(current, parentId, (body) => [...body, createBlock(type)]));
  };

  const removeNestedBlock = (parentId: string, childId: string) => {
    setScript((current) => updateNestedBlocks(current, parentId, (body) => body.filter((block) => block.id !== childId)));
  };

  const moveNestedUp = (parentId: string, index: number) => {
    if (index === 0) {
      return;
    }
    setScript((current) =>
      updateNestedBlocks(current, parentId, (body) => {
        const next = [...body];
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
        return next;
      }),
    );
  };

  const moveUp = (index: number) => {
    if (index === 0) {
      return;
    }

    setScript((current) => {
      const next = [...current];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const updateParam = (id: string, name: string, value: string | number) => {
    setScript((current) =>
      current.map((block) =>
        block.id === id ? { ...block, params: { ...block.params, [name]: value } } : block,
      ),
    );
  };

  const updateNestedParam = (parentId: string, childId: string, name: string, value: string | number) => {
    setScript((current) =>
      updateNestedBlocks(current, parentId, (body) =>
        body.map((block) =>
          block.id === childId ? { ...block, params: { ...block.params, [name]: value } } : block,
        ),
      ),
    );
  };

  const resetToConceptStarter = () => {
    setScript(loadStarterProgram(conceptStarter?.blockTemplate));
    setPaletteOpen(false);
  };

  const renderParamFields = (
    block: BlockInstance,
    definition: BlockDef,
    updateValue: (name: string, value: string | number) => void,
  ) => {
    if (definition.params.length === 0) {
      return null;
    }

    return (
      <div className="block-params">
        {definition.params.map((param) => (
          <label key={param.name} className="block-param-field">
            <span className="block-param-label">{param.label}</span>
            {param.type === 'select' ? (
              <select
                className="block-param-input"
                value={String(block.params[param.name] ?? param.default)}
                onChange={(event) => updateValue(param.name, event.target.value)}
              >
                {param.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input
                  type="number"
                  className="block-param-input"
                  value={String(block.params[param.name] ?? param.default)}
                  onChange={(event) => updateValue(param.name, Number(event.target.value))}
                />
                {param.unit && <span className="block-param-unit">{param.unit}</span>}
              </div>
            )}
          </label>
        ))}
      </div>
    );
  };

  const renderNestedBlock = (parentId: string, block: BlockInstance, index: number) => {
    const definition = getDefForType(block.type);
    return (
      <div key={block.id} className="block-item block-item-nested" style={{ borderLeftColor: definition.color }}>
        <div className="block-item-header">
          <GripVertical size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <span className="block-item-emoji">{definition.emoji}</span>
          <span className="block-item-label" style={{ color: definition.color }}>
            {definition.label}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {index > 0 && (
              <button type="button" className="block-icon-btn" onClick={() => moveNestedUp(parentId, index)} title="Move up">
                <ArrowUp size={11} />
              </button>
            )}
            <button type="button" className="block-icon-btn danger" onClick={() => removeNestedBlock(parentId, block.id)} title="Remove">
              <Trash2 size={11} />
            </button>
          </div>
        </div>
        {renderParamFields(block, definition, (name, value) => updateNestedParam(parentId, block.id, name, value))}
        {block.type === 'repeat' && (
          <div className="block-repeat-zone">
            <div className="block-repeat-header">
              <span>Loop body</span>
              <div className="block-repeat-actions">
                {BLOCK_DEFS.map((candidate) => (
                  <button
                    key={`${block.id}-${candidate.type}`}
                    type="button"
                    className="block-repeat-add"
                    onClick={() => addNestedBlock(block.id, candidate.type)}
                    title={candidate.description}
                  >
                    <Plus size={10} />
                    {candidate.label}
                  </button>
                ))}
              </div>
            </div>
            {block.body && block.body.length > 0 ? (
              <div className="block-repeat-body">
                {block.body.map((nestedBlock, nestedIndex) => renderNestedBlock(block.id, nestedBlock, nestedIndex))}
              </div>
            ) : (
              <div className="block-repeat-empty">Add one or more blocks inside this loop.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderTopLevelBlock = (block: BlockInstance, index: number) => {
    const definition = getDefForType(block.type);
    return (
      <div key={block.id} className="block-item" style={{ borderLeftColor: definition.color }}>
        <div className="block-item-header">
          <GripVertical size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <span className="block-item-emoji">{definition.emoji}</span>
          <span className="block-item-label" style={{ color: definition.color }}>
            {definition.label}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {index > 0 && (
              <button type="button" className="block-icon-btn" onClick={() => moveUp(index)} title="Move up">
                <ArrowUp size={11} />
              </button>
            )}
            <button type="button" className="block-icon-btn danger" onClick={() => removeBlock(block.id)} title="Remove">
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {renderParamFields(block, definition, (name, value) => updateParam(block.id, name, value))}

        {block.type === 'repeat' && (
          <div className="block-repeat-zone">
            <div className="block-repeat-header">
              <span>Loop body</span>
              <div className="block-repeat-actions">
                {BLOCK_DEFS.map((candidate) => (
                  <button
                    key={`${block.id}-${candidate.type}`}
                    type="button"
                    className="block-repeat-add"
                    onClick={() => addNestedBlock(block.id, candidate.type)}
                    title={candidate.description}
                  >
                    <Plus size={10} />
                    {candidate.label}
                  </button>
                ))}
              </div>
            </div>
            {block.body && block.body.length > 0 ? (
              <div className="block-repeat-body">
                {block.body.map((nestedBlock, nestedIndex) => renderNestedBlock(block.id, nestedBlock, nestedIndex))}
              </div>
            ) : (
              <div className="block-repeat-empty">Add one or more blocks inside this loop.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="block-editor-root">
      <div className="block-editor-header">
        <div className="block-editor-header-copy">
          <strong>{conceptStarter?.title ?? 'Structural mode'}</strong>
          <span>{conceptStarter?.tutorIntro ?? 'Stack blocks to describe what the robot should do.'}</span>
        </div>
        {conceptStarter?.blockTemplate && (
          <button type="button" className="block-starter-btn" onClick={resetToConceptStarter}>
            <Wand2 size={13} />
            Use concept starter
          </button>
        )}
      </div>

      {conceptStarter?.starterPrompt && (
        <div className="block-concept-hint">
          <span className="block-concept-hint-label">Challenge</span>
          <span>{conceptStarter.starterPrompt}</span>
        </div>
      )}

      <div className="block-script">
        {script.length === 0 && (
          <div className="block-empty">
            <div style={{ fontSize: '2rem', marginBottom: 6 }}>Blocks</div>
            <div style={{ fontWeight: 600, color: 'var(--muted)', fontSize: '0.82rem' }}>No blocks yet</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.74rem', opacity: 0.7 }}>
              Add blocks, then run them as a structural drawing plan.
            </div>
          </div>
        )}

        {script.map((block, index) => renderTopLevelBlock(block, index))}
      </div>

      {paletteOpen && (
        <div className="block-palette">
          <div className="block-palette-title">Add a block</div>
          <div className="block-palette-grid">
            {BLOCK_DEFS.map((definition) => (
              <button
                key={definition.type}
                type="button"
                className="block-palette-item"
                style={{ borderColor: `${definition.color}55` }}
                onClick={() => addBlock(definition.type)}
                title={definition.description}
              >
                <span style={{ fontSize: '1.1rem' }}>{definition.emoji}</span>
                <span className="block-palette-name" style={{ color: definition.color }}>
                  {definition.label}
                </span>
                <span className="block-palette-desc">{definition.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="block-footer">
        <button type="button" className="block-add-btn" onClick={() => setPaletteOpen((open) => !open)}>
          <Plus size={13} />
          Add Block
        </button>
        {script.length > 0 && (
          <>
            <button type="button" className="block-clear-btn" onClick={() => setScript([])}>
              Clear
            </button>
            <button
              type="button"
              className="block-run-btn"
              onClick={() => {
                void Promise.resolve(onRunProgram(compiledProgram)).catch(() => {
                  /* errors surfaced by parent (e.g. banner); avoid unhandled rejection */
                });
              }}
              disabled={isRunning || compiledProgram.blocks.length === 0}
            >
              <Play size={13} />
              {isRunning ? 'Drawing...' : 'Run Program'}
            </button>
          </>
        )}
      </div>

      {compiledProgram.blocks.length > 0 && (
        <div className="block-compiled-preview">
          <div className="block-preview-section">
            <span className="block-preview-eyebrow">Program outline</span>
            <div className="block-outline-list">
              {outline.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>
          <div className="block-preview-section">
            <span className="block-preview-eyebrow">Live preview</span>
            {previewSvg ? (
              <div
                className="block-preview-canvas"
                dangerouslySetInnerHTML={{ __html: previewSvg }}
              />
            ) : (
              <div className="block-preview-placeholder">This program does not draw yet.</div>
            )}
          </div>
          <div className="block-preview-section">
            <span className="block-preview-eyebrow">Structured program</span>
            <span className="block-preview-copy">{JSON.stringify(compiledProgram, null, 2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
