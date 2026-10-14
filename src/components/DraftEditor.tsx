import React, { useId, useState } from 'react';
import {
  DRAFT_CONTENT_MAX_CHARS,
  DRAFT_CONTENT_MIN_CHARS,
  countDraftCharacters,
  type ConversionDraft,
  type ValidationResult,
  type QualityScore,
} from '../lib/knowledge/conversion';

interface DraftEditorProps {
  draft: ConversionDraft;
  onSave: (content: string) => Promise<ConversionDraft | null>;
  onVerify: () => void;
  onCancel: () => void;
  saving: boolean;
}

/**
 * Local state is seeded ONCE from `draft`, so a parent that learns the server's
 * draft is different (after an activation, or a 409 from save or verify) must
 * remount this component with a new `key` — `KBPage`'s `OverlayPanel` does, from
 * the draft's id, its status and a counter bumped on every server resync. An
 * editor left mounted would keep showing, and offering to save, text the server
 * no longer holds.
 */
export function DraftEditor({ draft, onSave, onVerify, onCancel, saving }: DraftEditorProps) {
  const [content, setContent] = useState(draft.content);
  const [validation, setValidation] = useState<ValidationResult>(draft.validation);
  const [quality, setQuality] = useState<QualityScore>(draft.quality_score);
  // The text the server holds as of the last successful save (or the seed).
  // "Dirty" is the textarea differing from it, not a flag set by a keystroke
  // and cleared by a save: typing while a save is in flight must stay dirty, or
  // Activate would be offered over text that was never sent.
  const [savedContent, setSavedContent] = useState(draft.content);
  const dirty = content !== savedContent;
  const [saveError, setSaveError] = useState<string | null>(null);
  const counterId = useId();

  // Only a draft in the `draft` state can be saved: core answers 409 for a
  // verified one. The text of any other state is shown, not offered for edit.
  const editable = draft.status === 'draft';
  const length = countDraftCharacters(content);
  // Why Save is refused on length alone, stated beside the counter. `maxLength`
  // on the textarea is not used: it truncates a paste silently.
  const lengthProblem =
    length > DRAFT_CONTENT_MAX_CHARS
      ? `${(length - DRAFT_CONTENT_MAX_CHARS).toLocaleString('en-US')} ${length - DRAFT_CONTENT_MAX_CHARS === 1 ? 'character' : 'characters'} over the limit. Shorten the runbook to save it.`
      : length < DRAFT_CONTENT_MIN_CHARS
        ? `Too short to save: a runbook needs at least ${DRAFT_CONTENT_MIN_CHARS} characters.`
        : null;
  const saveBlockedReason = editable ? lengthProblem : null;

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const handleSave = async () => {
    setSaveError(null);
    const sent = content;
    try {
      const updated = await onSave(sent);
      if (updated) {
        setValidation(updated.validation);
        setQuality(updated.quality_score);
        setSavedContent(sent);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const gradeColor: Record<string, string> = {
    A: 'text-fm-success',
    B: 'text-fm-success',
    C: 'text-fm-warning',
    D: 'text-fm-warning',
    F: 'text-fm-critical',
  };
  const color = gradeColor[quality.grade] || 'text-fm-text-secondary';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-fm-text-primary">Editing: {draft.title}</h3>
          <p className="text-xs text-fm-text-tertiary font-mono">{draft.runbook_id}</p>
        </div>
        <div className="text-right">
          <span className={`text-sm font-mono font-medium ${color}`}>
            Quality: {quality.overall.toFixed(0)}/{quality.grade}
          </span>
          <div className="text-xs text-fm-text-tertiary mt-0.5">
            {validation.passed ? (
              <span className="text-fm-success">Validation: PASSED</span>
            ) : (
              <span className="text-fm-critical">Validation: FAILED</span>
            )}
          </div>
        </div>
      </div>

      {/* Validation errors */}
      {!validation.passed && validation.errors.length > 0 && (
        <div className="text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
          <p className="font-medium mb-1">Validation errors (fix before verifying):</p>
          <ul className="list-disc list-inside text-xs space-y-0.5">
            {validation.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Validation warnings */}
      {validation.warnings.length > 0 && (
        <div className="text-xs text-fm-warning bg-fm-warning-bg border border-fm-warning-border rounded-fm-btn p-3">
          {validation.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {/* Editor */}
      <textarea
        value={content}
        onChange={handleContentChange}
        readOnly={!editable}
        aria-label="Runbook content"
        aria-describedby={counterId}
        className="w-full h-[500px] px-4 py-3 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary font-mono text-sm leading-relaxed resize-y focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors"
        spellCheck={false}
      />

      {/* Length: the bounds are stated before the user reaches them */}
      <div id={counterId} className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={saveBlockedReason ? 'text-fm-critical font-medium' : 'text-fm-text-tertiary'}>
          {length.toLocaleString('en-US')} / {DRAFT_CONTENT_MAX_CHARS.toLocaleString('en-US')} characters
        </span>
        {saveBlockedReason && <span className="text-fm-critical">{saveBlockedReason}</span>}
        {draft.status === 'verified' && (
          <span className="text-fm-text-tertiary">This runbook is activated, so its text can no longer be edited.</span>
        )}
      </div>

      {/* Save error */}
      {saveError && (
        <div className="text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
          {saveError}
        </div>
      )}

      {/* Quality breakdown */}
      <div className="flex gap-4 text-xs text-fm-text-tertiary">
        <span>Completeness: {quality.completeness.toFixed(0)}</span>
        <span>Clarity: {quality.clarity.toFixed(0)}</span>
        <span>Actionability: {quality.actionability.toFixed(0)}</span>
        <span>Comprehensiveness: {quality.comprehensiveness.toFixed(0)}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving || !dirty || !editable || saveBlockedReason !== null}
          title={saveBlockedReason ?? undefined}
          className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        {draft.status === 'verified' ? (
          <span className="px-4 py-2 text-sm font-medium text-fm-success bg-fm-success-bg rounded-fm-btn">
            Activated
          </span>
        ) : (
          <button
            onClick={onVerify}
            disabled={!validation.passed || dirty}
            className="px-4 py-2 text-sm font-medium text-fm-accent border border-fm-accent rounded-fm-btn hover:bg-fm-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={dirty ? 'Save changes before activating' : !validation.passed ? 'Fix validation errors first' : 'Activate runbook'}
          >
            Activate
          </button>
        )}
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
        >
          Back to Results
        </button>
      </div>
    </div>
  );
}
