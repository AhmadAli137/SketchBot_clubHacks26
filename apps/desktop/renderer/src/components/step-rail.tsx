'use client';

import { Bot, Camera, Check, PencilLine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type Step = 'camera' | 'drawing' | 'launch';

const STEPS: { id: Step; icon: LucideIcon; label: string }[] = [
  { id: 'camera', icon: Camera, label: 'Setup' },
  { id: 'drawing', icon: PencilLine, label: 'Draw' },
  { id: 'launch', icon: Bot, label: 'Launch' },
];

type StepRailProps = {
  activeStep: Step;
  completedSteps: Set<Step>;
  onStepClick: (step: Step) => void;
};

export function StepRail({ activeStep, completedSteps, onStepClick }: StepRailProps) {
  return (
    <nav className="step-rail">
      {STEPS.map((step, index) => {
        const isActive = step.id === activeStep;
        const isCompleted = completedSteps.has(step.id);
        const Icon = step.icon;

        return (
          <div key={step.id} style={{ display: 'contents' }}>
            <button
              type="button"
              className={`step-rail-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
              onClick={() => onStepClick(step.id)}
              title={step.label}
            >
              {isCompleted && !isActive ? (
                <Check size={16} />
              ) : (
                <Icon size={16} />
              )}
              <span className="step-rail-item-label">{step.label}</span>
            </button>
            {index < STEPS.length - 1 && (
              <div className={`step-rail-connector ${isCompleted ? 'done' : ''}`} />
            )}
          </div>
        );
      })}
    </nav>
  );
}
