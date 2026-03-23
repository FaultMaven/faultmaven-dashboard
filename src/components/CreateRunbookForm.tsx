import React, { useState } from 'react';

interface CreateRunbookFormProps {
  onSubmit: (data: RunbookFormData) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  isCloud: boolean;
}

export interface RunbookFormData {
  title: string;
  domain: string;
  service: string;
  symptom_class: string[];
  severity: string;
  scope: string;
  tags: string[];
  difficulty: string;
  problem_definition: string;
  diagnostic_steps: string;
  mitigation: string;
  root_cause_resolution: string;
  verification: string;
  prevention: string;
  team_id?: string;
}

const inputClass =
  'w-full px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

const textareaClass = `${inputClass} font-mono text-sm leading-relaxed`;

const DOMAINS = ['database', 'networking', 'compute', 'application', 'security', 'storage', 'messaging'];
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'];

const SECTION_PLACEHOLDERS: Record<string, string> = {
  problem_definition:
    '- Exact alert names, error messages as they appear in logs\n- Metric patterns to look for\n- Example: FATAL: too many connections for role "app_user"',
  diagnostic_steps:
    '### Step 1: Check current state\n```bash\nyour-command-here\n```\nWhat to look for in the output...\n\n### Step 2: Identify root cause\n```bash\nanother-command\n```',
  mitigation:
    '**Risk**: What could go wrong with this mitigation\n```bash\nmitigation-command\n```\n**Verify**: How to confirm it worked\n**Duration**: How long the mitigation is safe',
  root_cause_resolution:
    '**If** diagnostic step 1 shows X:\n```bash\npermanent-fix-command\n```\n\n**If** diagnostic step 2 shows Y:\n```bash\nalternative-fix\n```',
  verification:
    '- Specific metric or command to confirm the fix\n- Observation period (e.g., "monitor for 15 minutes")\n- What "back to normal" looks like',
  prevention:
    '- Configuration change to prevent recurrence\n- Monitoring alert to add\n- Process change or documentation update',
};

export function CreateRunbookForm({ onSubmit, onCancel, loading, error, isAdmin, isCloud }: CreateRunbookFormProps) {
  const [form, setForm] = useState<RunbookFormData>({
    title: '',
    domain: 'application',
    service: '',
    symptom_class: [],
    severity: 'medium',
    scope: 'personal',
    tags: [],
    difficulty: 'intermediate',
    problem_definition: '',
    diagnostic_steps: '',
    mitigation: '',
    root_cause_resolution: '',
    verification: '',
    prevention: '',
  });
  const [symptomInput, setSymptomInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const canCreateGlobal = !isCloud || isAdmin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      symptom_class: symptomInput.split(',').map((s) => s.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean),
      tags: tagsInput.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    };
    await onSubmit(data);
  };

  const update = (field: keyof RunbookFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-fm-text-primary">Create Runbook</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-fm-text-tertiary hover:text-fm-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
          {error}
        </div>
      )}

      {/* Metadata row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-fm-text-secondary mb-1">
            Title <span className="text-fm-critical">*</span>
          </label>
          <input
            type="text"
            required
            minLength={10}
            maxLength={100}
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            className={inputClass}
            placeholder="e.g. PostgreSQL Connection Pool Exhaustion"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-fm-text-secondary mb-1">
            Service <span className="text-fm-critical">*</span>
          </label>
          <input
            type="text"
            required
            value={form.service}
            onChange={(e) => update('service', e.target.value)}
            className={inputClass}
            placeholder="e.g. postgresql, nginx, kubernetes"
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-fm-text-secondary mb-1">Domain</label>
          <select value={form.domain} onChange={(e) => update('domain', e.target.value)} className={inputClass}>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-fm-text-secondary mb-1">Severity</label>
          <select value={form.severity} onChange={(e) => update('severity', e.target.value)} className={inputClass}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-fm-text-secondary mb-1">Difficulty</label>
          <select value={form.difficulty} onChange={(e) => update('difficulty', e.target.value)} className={inputClass}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-fm-text-secondary mb-1">Target KB</label>
          <select value={form.scope} onChange={(e) => update('scope', e.target.value)} className={inputClass}>
            <option value="personal">Personal</option>
            {isCloud && <option value="team">Team</option>}
            {canCreateGlobal && <option value="global">Global</option>}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-fm-text-secondary mb-1">
            Symptom Classes <span className="text-fm-critical">*</span>
          </label>
          <input
            type="text"
            required
            value={symptomInput}
            onChange={(e) => setSymptomInput(e.target.value)}
            className={inputClass}
            placeholder="e.g. connection_refused, latency, oom"
          />
          <p className="text-xs text-fm-text-tertiary mt-1">Comma-separated, lowercase with underscores</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-fm-text-secondary mb-1">Tags</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className={inputClass}
            placeholder="e.g. postgresql, connection-pool, database"
          />
          <p className="text-xs text-fm-text-tertiary mt-1">Comma-separated, lowercase with hyphens</p>
        </div>
      </div>

      {/* Runbook sections */}
      {(
        [
          ['problem_definition', 'Problem Definition'],
          ['diagnostic_steps', 'Diagnostic Steps'],
          ['mitigation', 'Mitigation'],
          ['root_cause_resolution', 'Root Cause Resolution'],
          ['verification', 'Verification'],
          ['prevention', 'Prevention'],
        ] as [keyof RunbookFormData, string][]
      ).map(([field, label]) => (
        <div key={field}>
          <label className="block text-sm font-medium text-fm-text-secondary mb-1">
            {label} <span className="text-fm-critical">*</span>
          </label>
          <textarea
            required
            minLength={10}
            value={form[field] as string}
            onChange={(e) => update(field, e.target.value)}
            className={textareaClass}
            rows={5}
            placeholder={SECTION_PLACEHOLDERS[field]}
          />
        </div>
      ))}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating...' : 'Create Draft Runbook'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
