import React, { useState } from 'react';
import { UploadZone } from './UploadZone';

interface ConvertUploadProps {
  onConvert: (file: File, scope: string, teamId?: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  isCloud: boolean;
}

const inputClass =
  'w-full px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

export function ConvertUpload({ onConvert, loading, error, isAdmin, isCloud }: ConvertUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [scope, setScope] = useState<string>('personal');
  const [teamId, setTeamId] = useState('');

  const canConvertGlobal = !isCloud || isAdmin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    await onConvert(file, scope, scope === 'team' ? teamId : undefined);
  };

  const handleFileSelect = (f: File) => {
    setFile(f);
  };

  const handleReset = () => {
    setFile(null);
    setScope('personal');
    setTeamId('');
  };

  return (
    <div className="bg-fm-surface rounded-fm-card border border-fm-border p-6">
      <h3 className="text-lg font-semibold text-fm-text-primary mb-4">Convert Document to Runbook(s)</h3>

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
            <label className="block text-sm font-medium text-fm-text-secondary mb-2">Target Knowledge Base</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  value="personal"
                  checked={scope === 'personal'}
                  onChange={() => setScope('personal')}
                  className="accent-fm-accent"
                />
                <span className="text-sm text-fm-text-primary">Personal</span>
              </label>

              {isCloud && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value="team"
                    checked={scope === 'team'}
                    onChange={() => setScope('team')}
                    className="accent-fm-accent"
                  />
                  <span className="text-sm text-fm-text-primary">Team</span>
                </label>
              )}

              {canConvertGlobal && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value="global"
                    checked={scope === 'global'}
                    onChange={() => setScope('global')}
                    className="accent-fm-accent"
                  />
                  <span className="text-sm text-fm-text-primary">Global</span>
                </label>
              )}
            </div>
          </div>

          {scope === 'team' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-fm-text-secondary mb-1">Team ID</label>
              <input
                type="text"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className={inputClass}
                placeholder="Enter team ID"
                required
              />
            </div>
          )}

          {error && (
            <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
              {error}
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
              onClick={handleReset}
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
