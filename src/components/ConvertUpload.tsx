import React, { useState } from 'react';
import { UploadZone } from './UploadZone';
import type { ConversionErrorInfo } from '../lib/knowledge/conversion';
import { useAvailableScopes } from '../hooks/useAvailableScopes';

const SCOPE_LABELS: Record<string, string> = {
  personal: 'Personal',
  team: 'Team',
  global: 'Global',
};

interface ConvertUploadProps {
  onConvert: (file: File, scope: string) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
  error: ConversionErrorInfo | null;
  /**
   * Switch to the runbook template. Supplied for refusals whose remedy is
   * authoring rather than a different file. An error MESSAGE cannot carry that
   * remedy here: NewDropdown is unmounted for the whole lifetime of this
   * overlay, so every control it could name is off-screen as it is read.
   */
  onWriteRunbook?: () => void;
}

/**
 * Error codes whose remedy is "author it instead", and which are therefore
 * offered the template button. Keyed on the CODE, not on the copy — the message
 * is translated text and must stay free to change without silently dropping the
 * affordance.
 */
const AUTHORING_REMEDY_CODES = new Set(['ALREADY_A_RUNBOOK']);

export function ConvertUpload({ onConvert, onCancel, loading, error, onWriteRunbook }: ConvertUploadProps) {
  const { scopes: availableScopes } = useAvailableScopes();
  const [file, setFile] = useState<File | null>(null);
  const [scope, setScope] = useState<string>('personal');

  // Derive the effective scope during render rather than syncing invalid state in
  // an effect: if the picker re-fetches and the selected scope is no longer
  // available (e.g. user lost team membership), fall back to personal.
  const effectiveScope = availableScopes.includes(scope as never) ? scope : 'personal';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    await onConvert(file, effectiveScope);
  };

  const handleFileSelect = (f: File) => {
    setFile(f);
  };

  const handleReset = () => {
    setFile(null);
    setScope('personal');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-fm-text-primary">Convert Document to Runbook(s)</h3>
        <button
          onClick={onCancel}
          className="text-sm text-fm-text-tertiary hover:text-fm-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>

      {!file ? (
        <UploadZone
          onFileSelected={handleFileSelect}
          accept=".pdf,.docx,.doc,.txt,.md,.html,.htm"
          label="Drop a document to convert"
          helperText="PDF, DOCX, TXT, Markdown, or HTML (max 10 MB)"
        />
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-3 mb-4 p-3 bg-fm-surface-alt rounded-fm-input border border-fm-border">
            <svg className="w-5 h-5 text-fm-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-fm-text-primary truncate">{file.name}</p>
              <p className="text-xs text-fm-text-tertiary">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-fm-text-tertiary hover:text-fm-text-primary transition-colors"
              aria-label="Remove file"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-fm-text-secondary mb-2">KB Scope</label>
            <div className="flex gap-4 flex-wrap">
              {availableScopes.map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value={s}
                    checked={effectiveScope === s}
                    onChange={() => setScope(s)}
                    className="accent-fm-accent"
                  />
                  <span className="text-sm text-fm-text-primary">{SCOPE_LABELS[s] ?? s}</span>
                </label>
              ))}
            </div>
          </div>


          {error && (
            <div className="mb-4 text-sm bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
              <p className="font-medium text-fm-critical">{error.title}</p>
              <p className="text-fm-text-secondary mt-1">{error.message}</p>
              {/* The way out reads at the same size as the diagnosis. It was
                  text-xs tertiary: the smallest, lowest-contrast, last-read line
                  of a red panel whose first two lines say the operation failed —
                  the visual half of a dead end, however the sentence is worded. */}
              <p className="text-fm-text-secondary mt-2">{error.action}</p>
              {onWriteRunbook && error.code && AUTHORING_REMEDY_CODES.has(error.code) && (
                <button
                  type="button"
                  onClick={onWriteRunbook}
                  className="mt-3 px-3 py-1.5 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors"
                >
                  Write Runbook
                </button>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Converting...
                </span>
              ) : (
                'Convert'
              )}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
