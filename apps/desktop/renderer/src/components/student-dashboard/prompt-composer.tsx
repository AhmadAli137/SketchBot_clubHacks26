'use client';

import { BlockEditor } from '@/components/block-editor';
import { CodeEditor } from '@/components/code-editor';

import type { PromptComposerProps } from './types';

export function PromptComposer({
  interactionMode,
  composing,
  conceptId,
  apiBase,
  showCodeFocus,
  onInteractionModeChange,
  onBlockRun,
  onBlockPreviewSvgChange,
  onCodeSvgResult,
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
  return (
    <div className="learn-prompt-bar" data-tour="session-prompt-composer">
      <div className="learn-mode-row">
        <button
          type="button"
          className={`learn-mode-tab ${interactionMode === 'blocks' ? 'active' : ''}`}
          onClick={() => onInteractionModeChange('blocks')}
        >
          ⬛ Blocks
        </button>
        <button
          type="button"
          className={`learn-mode-tab ${interactionMode === 'code' ? 'active' : ''}`}
          onClick={() => onInteractionModeChange('code')}
        >
          {'</>'} Code
        </button>
        <button
          type="button"
          className={`learn-mode-tab ${showCodeFocus ? 'active' : ''}`}
          style={{ marginLeft: 'auto' }}
          onClick={onToggleCodeFocus}
        >
          {showCodeFocus ? 'Compact' : 'Expand'}
        </button>
      </div>

      {interactionMode === 'blocks' && (
        <BlockEditor
          conceptId={conceptId}
          onRunProgram={onBlockRun}
          isRunning={composing}
          onPreviewSvgChange={onBlockPreviewSvgChange}
        />
      )}

      {interactionMode === 'code' && (
        <CodeEditor apiBase={apiBase} conceptId={conceptId} onSvgResult={onCodeSvgResult} />
      )}
    </div>
  );
}
