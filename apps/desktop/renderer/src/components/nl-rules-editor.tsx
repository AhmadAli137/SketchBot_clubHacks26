'use client';

import { useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import type { Rule, RuleSet } from '@/components/student-dashboard/types';

const TRIGGERS = [
  { value: 'always', label: 'Always' },
  { value: 'start', label: 'When started' },
  { value: 'obstacle_near', label: 'When obstacle is near' },
  { value: 'button_a', label: 'When button A is pressed' },
  { value: 'tilted', label: 'When tilted' },
];

const ACTIONS = [
  { value: 'move_forward', label: 'Move forward' },
  { value: 'move_backward', label: 'Move backward' },
  { value: 'turn_left', label: 'Turn left 90°' },
  { value: 'turn_right', label: 'Turn right 90°' },
  { value: 'stop', label: 'Stop' },
  { value: 'pen_down', label: 'Lower pen' },
  { value: 'pen_up', label: 'Lift pen' },
  { value: 'draw_circle', label: 'Draw a circle' },
  { value: 'draw_square', label: 'Draw a square' },
  { value: 'spin', label: 'Spin around' },
];

let _idCounter = 1;
function uid() { return `rule-${_idCounter++}`; }

function defaultRule(): Rule {
  return { id: uid(), trigger: 'always', action: 'move_forward' };
}

type Props = {
  onRun?: (rules: RuleSet) => void | Promise<void>;
  isRunning?: boolean;
};

export function NLRulesEditor({ onRun, isRunning }: Props) {
  const [rules, setRules] = useState<Rule[]>([defaultRule()]);

  const updateRule = (id: string, field: keyof Omit<Rule, 'id'>, value: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const addRule = () => setRules((prev) => [...prev, defaultRule()]);

  const removeRule = (id: string) =>
    setRules((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const handleRun = () => {
    if (onRun) void onRun(rules);
  };

  return (
    <div className="rules-editor">
      <div className="rules-header">
        <span className="rules-label">🤖 If → Then Rules</span>
        <span className="rules-hint">Tell the robot what to do using simple rules</span>
      </div>

      <Reorder.Group axis="y" values={rules} onReorder={setRules} className="rules-list">
        <AnimatePresence initial={false}>
          {rules.map((rule, i) => (
            <Reorder.Item
              key={rule.id}
              value={rule}
              as="div"
              className="rules-row"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.22 }}
            >
              <span className="rules-index">{i + 1}</span>

              <div className="rules-drag-handle" title="Drag to reorder">⋮⋮</div>

              <div className="rules-if-label">If</div>
              <select
                className="rules-select"
                value={rule.trigger}
                onChange={(e) => updateRule(rule.id, 'trigger', e.target.value)}
              >
                {TRIGGERS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              <div className="rules-arrow">→</div>

              <div className="rules-then-label">Then</div>
              <select
                className="rules-select"
                value={rule.action}
                onChange={(e) => updateRule(rule.id, 'action', e.target.value)}
              >
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>

              <motion.button
                type="button"
                className="rules-remove"
                title="Remove rule"
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => removeRule(rule.id)}
              >
                ✕
              </motion.button>
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>

      <div className="rules-footer">
        <motion.button
          type="button"
          className="rules-add-btn"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={addRule}
        >
          + Add Rule
        </motion.button>

        <motion.button
          type="button"
          className="rules-run-btn"
          disabled={isRunning}
          whileHover={isRunning ? {} : { scale: 1.03 }}
          whileTap={isRunning ? {} : { scale: 0.96 }}
          onClick={handleRun}
        >
          {isRunning ? '⏳ Running…' : '▶ Run Rules'}
        </motion.button>
      </div>
    </div>
  );
}
