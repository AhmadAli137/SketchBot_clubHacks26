'use client';

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
  // Explorer mode: rules tab only — no code or blocks
  const isExplorer = difficultyLevel === 'explorer';

  // Ensure interactionMode is valid for this difficulty level
  const effectiveMode = isExplorer ? 'rules' : (interactionMode === 'rules' ? 'blocks' : interactionMode);

  return (
    <div className="learn-prompt-bar" data-tour="session-prompt-composer">
      <div className="learn-mode-row">
        {isExplorer ? (
          <button
            type="button"
            className="learn-mode-tab active"
          >
            🎛️ Rules
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`learn-mode-tab ${effectiveMode === 'blocks' ? 'active' : ''}`}
              onClick={() => onInteractionModeChange('blocks')}
            >
              ⬛ Blocks
            </button>
            <button
              type="button"
              className={`learn-mode-tab ${effectiveMode === 'code' ? 'active' : ''}`}
              onClick={() => onInteractionModeChange('code')}
            >
              {'</>'} Code
            </button>
          </>
        )}

        {!isExplorer && (
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
    </div>
  );
}
