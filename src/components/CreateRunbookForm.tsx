import React, { useEffect, useState } from 'react';
import { useAvailableScopes } from '../hooks/useAvailableScopes';

const SCOPE_LABELS: Record<string, string> = {
  personal: 'Personal',
  team: 'Team',
  organization: 'Organization',
  global: 'Global',
};

interface CreateRunbookFormProps {
  onSubmit: (data: RunbookFormData) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
  error: string | null;
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
  symptom_recognition: string;
  applicability: string;
  diagnostic_steps: string;
  causes: string;
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
  symptom_recognition:
    '- Exact alert names, error messages as they appear in logs\n- Metric patterns to look for\n- Example: FATAL: too many connections for role "app_user"\n- Dashboard panels or monitors that fire',
  applicability:
    '- Which environments or deployment configurations this applies to\n- Service versions affected\n- Prerequisites or conditions required\n- Example: Applies to PostgreSQL 14+ with PgBouncer connection pooling',
  diagnostic_steps:
    '### Step 1: Check current state\n```bash\nyour-command-here\n```\nWhat to look for in the output...\n\n### Step 2: Identify root cause\n```bash\nanother-command\n```',
  causes:
    '### Cause A: <Name>\n**Statement**: What is happening\n**Mechanism**: Why it happens\n**Indicator**: How to confirm this cause\n**Mitigation**: Immediate relief steps\n**Resolution**: Permanent fix\n**Verification**: How to confirm it worked\n\n### Cause Z: Unidentified [Default]\n**Statement**: Root cause not yet determined\n**Mechanism**: Unknown\n**Indicator**: None of the above causes match\n**Mitigation**: Escalate to on-call engineer\n**Resolution**: Investigate further\n**Verification**: Monitor after escalation',
  prevention:
    '- Configuration change to prevent recurrence\n- Monitoring alert to add\n- Process change or documentation update',
};

export function CreateRunbookForm({ onSubmit, onCancel, loading, error }: CreateRunbookFormProps) {
  const { scopes: availableScopes } = useAvailableScopes();
  const [form, setForm] = useState<RunbookFormData>({
    title: '',
    domain: 'application',
    service: '',
    symptom_class: [],
    severity: 'medium',
    scope: 'personal',
    tags: [],
    difficulty: 'intermediate',
    symptom_recognition: '',
    applicability: '',
    diagnostic_steps: '',
    causes: '',
    prevention: '',
  });
  const [symptomInput, setSymptomInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // If the picker re-fetches and the previously-selected scope is no longer
  // available (e.g. user lost team membership), fall back to personal.
  useEffect(() => {
    if (!availableScopes.includes(form.scope as never)) {
      setForm((prev) => ({ ...prev, scope: 'personal' }));
    }
  }, [availableScopes, form.scope]);

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
          <label className="block text-sm font-medium text-fm-text-secondary mb-1">KB Scope</label>
          <select value={form.scope} onChange={(e) => update('scope', e.target.value)} className={inputClass}>
            {availableScopes.map((s) => (
              <option key={s} value={s}>{SCOPE_LABELS[s] ?? s}</option>
            ))}
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
          ['symptom_recognition', 'Symptom Recognition'],
          ['applicability', 'Applicability'],
          ['diagnostic_steps', 'Diagnostic Steps'],
          ['causes', 'Causes'],
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
