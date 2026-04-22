'use client';

import { ArduinoEditor } from '@/components/arduino-editor';
import { BlockEditor } from '@/components/block-editor';
import { CodeEditor } from '@/components/code-editor';
import { NLRulesEditor } from '@/components/nl-rules-editor';

import type { PromptComposerProps } from './types';

export function PromptComposer({
  interactionMode,
  difficultyLevel,
  composing,
  conceptId,
  apiBase,
  showCodeFocus,
  onInteractionModeChange,
  onBlockRun,
  onBlockPreviewSvgChange,
  onCodeSvgResult,
  onRulesRun,
  onToggleCodeFocus,
  activeLayer: _activeLayer,
  prompt: _prompt,
  uploading: _uploading,
  featuredTasks: _featuredTasks,
  onPromptChange: _onPromptChange,
  onSubmitPrompt: _onSubmitPrompt,
  onUploadFile: _onUploadFile,
  onLoadTask: _onLoadTask,
}: PromptComposerProps) {
  const isExplorer = difficultyLevel === 'explorer';
  const isEngineer = difficultyLevel === 'engineer';

  // Clamp effectiveMode to what's valid at this difficulty level
  const effectiveMode = (() => {
    if (isExplorer) return 'rules';
    if (interactionMode === 'rules') return isEngineer ? 'arduino' : 'blocks';
    if (interactionMode === 'arduino' && !isEngineer) return 'blocks';
    return interactionMode;
  })();

  return (
    <div className="learn-prompt-bar" data-tour="session-prompt-composer">
      <div className="learn-mode-row">
        {isExplorer ? (
          <button type="button" className="learn-mode-tab active">
            🎛️ Rules
          </button>
        ) : (
          <>
            {/* Blocks tab — not shown for engineer (they skip straight to code/arduino) */}
            {!isEngineer && (
              <button
                type="button"
                className={`learn-mode-tab ${effectiveMode === 'blocks' ? 'active' : ''}`}
                onClick={() => onInteractionModeChange('blocks')}
              >
                ⬛ Blocks
              </button>
            )}

            {/* Python Code tab */}
            <button
              type="button"
              className={`learn-mode-tab ${effectiveMode === 'code' ? 'active' : ''}`}
              onClick={() => onInteractionModeChange('code')}
            >
              {'</>'} Python
            </button>

            {/* C++/Arduino tab — engineer only */}
            {isEngineer && (
              <button
                type="button"
                className={`learn-mode-tab ard-tab ${effectiveMode === 'arduino' ? 'active' : ''}`}
                onClick={() => onInteractionModeChange('arduino')}
              >
                <span className="ard-tab-icon">⚡</span> C++ / Arduino
              </button>
            )}
          </>
        )}

        {/* Expand/Compact toggle — only for non-explorer non-arduino modes */}
        {!isExplorer && effectiveMode !== 'arduino' && (
          <button
            type="button"
            className={`learn-mode-tab ${showCodeFocus ? 'active' : ''}`}
            style={{ marginLeft: 'auto' }}
            onClick={onToggleCodeFocus}
          >
            {showCodeFocus ? 'Compact' : 'Expand'}
          </button>
        )}
      </div>

      {isExplorer && (
        <NLRulesEditor onRun={onRulesRun} isRunning={composing} />
      )}

      {!isExplorer && effectiveMode === 'blocks' && (
        <BlockEditor
          conceptId={conceptId}
          onRunProgram={onBlockRun}
          isRunning={composing}
          onPreviewSvgChange={onBlockPreviewSvgChange}
        />
      )}

      {!isExplorer && effectiveMode === 'code' && (
        <CodeEditor apiBase={apiBase} conceptId={conceptId} onSvgResult={onCodeSvgResult} />
      )}

      {isEngineer && effectiveMode === 'arduino' && (
        <ArduinoEditor apiBase={apiBase} conceptId={conceptId} />
      )}
    </div>
  );
}
