import React, { useRef, useState } from 'react';
import { useAvailableScopes } from '../hooks/useAvailableScopes';

const SCOPE_LABELS: Record<string, string> = {
  personal: 'Personal',
  team: 'Team',
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
}

const inputClass =
  'w-full px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

const textareaClass = `${inputClass} font-mono text-sm leading-relaxed`;

/**
 * The `symptom_class` failure-mode taxonomy — a CLOSED vocabulary.
 *
 * A free-text field here accepted anything, and the backend rejects anything
 * off-vocabulary as a hard error: the author either extends the taxonomy
 * deliberately or moves a long-tail symptom into `tags`. So an author typing
 * `this_a_test_for_runbook_creation` got a valid-looking submission, a draft
 * saved with bad metadata, and a validation failure they could only repair by
 * hand-editing YAML frontmatter in the markdown editor. Choosing from the list
 * removes that entire path.
 *
 * A HAND-MAINTAINED COPY, like the three below it. The backend says so of its
 * own list (`runbook_validator.py`: "this is a hand-maintained copy — the repos
 * can't import each other — so grow it HERE and in kb-toolkit in lock-step"),
 * and this is the third such copy. It is not in the OpenAPI spec, which types
 * the field as a bare `string[]`, so there is nothing to generate from. Grow it
 * with the other two; if the backend ever publishes the vocabulary, delete this
 * and render from that instead.
 */
const SYMPTOM_CLASSES = [
  'auth_failure',
  'connection_refused',
  'cpu_saturation',
  'crash_loop',
  'data_loss',
  'deployment_failure',
  'disk_full',
  'image_pull_failure',
  'latency',
  'node_failure',
  'oom',
  'replication_lag',
  'scheduling_failure',
  'service_unavailable',
  'throughput_degradation',
  'timeout',
];

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
    '### Cause A: <Name>\n**Statement:** The single root cause (one sentence)\n**Chain:**\n- root: the root cause\n- s1: the intermediate effect\n- D: the observed problem (Symptom)\n**Indicators:**\n- root: [Step 1] observable that confirms the root\n- s1: [Step 2] observable that confirms s1\n**Interventions:**\n- **remediation** (root): the permanent fix\n\n  ```bash\n  your-fix-command\n  ```\n\n  **Verification:** how to confirm it worked\n\n### Cause Z: Unidentified\n**Statement:** None of the documented causes match the evidence\n**Indicators:**\n- [Default]\n**Interventions:**\n- **mitigation** (D): capture full diagnostics and escalate to an SME\n  **Risk:** diagnostic only. **Duration:** until SME review. **Verification:** N/A.',
  prevention:
    '- Configuration change to prevent recurrence\n- Monitoring alert to add\n- Process change or documentation update',
};

export function CreateRunbookForm({ onSubmit, onCancel, loading, error }: CreateRunbookFormProps) {
  const { scopes: availableScopes } = useAvailableScopes();
  const [form, setForm] = useState<RunbookFormData>({
    title: '',
    // UNSET, not pre-filled. `domain`, `severity` and `scope` are REQUIRED by
    // the backend with no default, so a pre-selected value is not a convenience
    // — it is metadata the author never chose, written into every runbook and
    // then used to rank retrieval. They now start empty and the form will not
    // submit until each is picked.
    domain: '',
    service: '',
    symptom_class: [],
    severity: '',
    scope: '',
    tags: [],
    // `difficulty` is the one select the backend DOES default (to
    // "intermediate"), so leaving it unset is a real choice rather than a
    // deferred error — the request simply omits it.
    difficulty: '',
    symptom_recognition: '',
    applicability: '',
    diagnostic_steps: '',
    causes: '',
    prevention: '',
  });

  const [tagsInput, setTagsInput] = useState('');

  // Derive the effective scope during render rather than syncing invalid state in
  // an effect: if the picker re-fetches and the previously-selected scope is no
  // longer available (e.g. user lost team membership), fall back to personal.
  // An empty scope stays empty — the field is required and the author has not
  // chosen yet. Only a scope that was chosen and then became unavailable (a lost
  // team membership, say) falls back, which is the case this was written for.
  const effectiveScope =
    form.scope === '' || availableScopes.includes(form.scope as never) ? form.scope : 'personal';

  /**
   * TEAM IS NOT OFFERED, because this form cannot satisfy it.
   *
   * The backend refuses team scope without a `team_id`
   * (`conversion_routes.py`: "team_id is required for team scope") and this
   * request has no field to carry one. Offering the option produces a
   * guaranteed 400 with nothing the author can do about it — and that became
   * far more likely the moment the scope stopped defaulting to `personal`,
   * since every author now has to choose something deliberately.
   *
   * Hiding it is the honest stopgap: it is better to not offer a capability
   * than to offer one that always fails. The real fix is a team picker
   * alongside this select, which needs the request to carry `team_id`.
   */
  const selectableScopes = availableScopes.filter((scope) => scope !== 'team');

  /**
   * The two rules the browser cannot enforce, checked before we submit.
   *
   * Both were reachable before: a chip group is not a `required` input, and the
   * Causes structure is a markdown convention no form control knows about. Both
   * produce a draft that is SAVED and then fails validation — recoverable only
   * by hand-editing the generated markdown, which is a long way from the form
   * the author filled in.
   */
  const localErrors: string[] = [];
  if (form.symptom_class.length === 0) {
    localErrors.push('Pick at least one symptom class.');
  }
  // THE BACKEND'S OWN GRAMMAR, not an approximation of it:
  // `^### Cause ([A-Z]):\s*(.+?)\s*$` (runbook_grammar.py). A looser check here
  // is worse than none — it waves through `### Cause 1:`, `### Cause AB:` and a
  // bare `### Cause`, each of which then fails on the server, saves an invalid
  // draft, and takes the author to the editor to repair by hand. Exactly one
  // space, a single capital letter, a colon, and a non-empty name.
  if (form.causes.trim() !== '' && !/^### Cause [A-Z]:[ \t]*\S.*$/m.test(form.causes)) {
    localErrors.push(
      'Causes needs a heading of the form "### Cause A: <name>" — a single capital letter and a name.',
    );
  }

  const errorRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (localErrors.length > 0) {
      // A SILENT RETURN IS INDISTINGUISHABLE FROM A BROKEN BUTTON. The warning
      // renders at the top of a form with sixteen chips and five tall
      // textareas, so from the author's seat at the Create button nothing
      // happened at all. Bring it to them, and make it the focus so a screen
      // reader announces it rather than leaving them on a button that appears
      // inert.
      errorRef.current?.scrollIntoView({ block: 'center' });
      errorRef.current?.focus();
      return;
    }
    const data = {
      ...form,
      scope: effectiveScope,
      symptom_class: form.symptom_class,
      tags: tagsInput.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    };
    await onSubmit(data);
  };

  // "Has the author touched anything yet?" — so the checks above surface as
  // guidance while they work rather than as a complaint about a blank form.
  // ANY field, not a sample of four. Sampling meant an author who had filled
  // the three selects, the tags and four of the five sections was still "not
  // started", so the guidance the block exists to give stayed hidden until they
  // clicked Create and met the blocked submit above.
  const dirty =
    form.symptom_class.length > 0 ||
    form.tags.length > 0 ||
    Object.entries(form).some(
      ([key, value]) =>
        key !== 'symptom_class' && key !== 'tags' && typeof value === 'string' && value !== '',
    );

  const toggleSymptom = (symptom: string) => {
    setForm((prev) => ({
      ...prev,
      symptom_class: prev.symptom_class.includes(symptom)
        ? prev.symptom_class.filter((s) => s !== symptom)
        : [...prev.symptom_class, symptom],
    }));
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
        <div className="text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3 whitespace-pre-line">
          {/* `whitespace-pre-line`: a saved-but-invalid draft reports one
              validation error per line, and collapsing them into a paragraph
              makes a list of distinct problems read as one run-on sentence. */}
          {error}
        </div>
      )}

      {/* Shown only once the author has started filling the form, so an empty
          form is not scolded before anyone has done anything. */}
      {localErrors.length > 0 && dirty && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="text-sm text-fm-warning bg-fm-warning-bg border border-fm-warning-border rounded-fm-btn p-3 focus:outline-none focus:ring-2 focus:ring-fm-warning"
        >
          <ul className="list-disc list-inside space-y-0.5">
            {localErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Metadata row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="runbook-title" className="block text-sm font-medium text-fm-text-secondary mb-1">
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
            id="runbook-title"
            placeholder="e.g. PostgreSQL Connection Pool Exhaustion"
          />
        </div>
        <div>
          <label htmlFor="runbook-service" className="block text-sm font-medium text-fm-text-secondary mb-1">
            Service <span className="text-fm-critical">*</span>
          </label>
          <input
            type="text"
            required
            value={form.service}
            onChange={(e) => update('service', e.target.value)}
            className={inputClass}
            id="runbook-service"
            placeholder="e.g. postgresql, nginx, kubernetes"
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <label htmlFor="runbook-domain" className="block text-sm font-medium text-fm-text-secondary mb-1">
            Domain <span className="text-fm-critical">*</span>
          </label>
          <select
            id="runbook-domain"
            required
            value={form.domain}
            onChange={(e) => update('domain', e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="runbook-severity" className="block text-sm font-medium text-fm-text-secondary mb-1">
            Severity <span className="text-fm-critical">*</span>
          </label>
          <select
            id="runbook-severity"
            required
            value={form.severity}
            onChange={(e) => update('severity', e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="runbook-difficulty" className="block text-sm font-medium text-fm-text-secondary mb-1">
            Difficulty</label>
          <select id="runbook-difficulty" value={form.difficulty} onChange={(e) => update('difficulty', e.target.value)} className={inputClass}>
            {/* Genuinely optional — the backend defaults it — so "not specified"
                is a real answer and the request omits the field entirely. */}
            <option value="">Not specified</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="runbook-scope" className="block text-sm font-medium text-fm-text-secondary mb-1">
            KB Scope <span className="text-fm-critical">*</span>
          </label>
          <select
            id="runbook-scope"
            required
            value={effectiveScope}
            onChange={(e) => update('scope', e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {selectableScopes.map((s) => (
              <option key={s} value={s}>{SCOPE_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          {/* Not `htmlFor` — a chip group is not a form control, so the name
              is carried by `aria-label` on the group itself below. */}
          <span className="block text-sm font-medium text-fm-text-secondary mb-1">
            Symptom Classes <span className="text-fm-critical">*</span>
          </span>
          {/* CHOSEN, not typed. The backend rejects anything off this list as a
              hard error, so a free-text box could only ever produce a draft that
              fails validation after it has been saved — repairable then solely
              by hand-editing YAML frontmatter. */}
          <div
            role="group"
            aria-label="Symptom classes"
            className="flex flex-wrap gap-1.5 p-2 border border-fm-border rounded-fm-input bg-fm-surface-alt max-h-36 overflow-y-auto"
          >
            {SYMPTOM_CLASSES.map((symptom) => {
              const selected = form.symptom_class.includes(symptom);
              return (
                <button
                  key={symptom}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleSymptom(symptom)}
                  className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                    selected
                      ? 'bg-fm-accent text-white'
                      : 'bg-fm-elevated text-fm-text-secondary hover:text-fm-text-primary'
                  }`}
                >
                  {symptom}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-fm-text-tertiary mt-1">
            Pick at least one. A symptom that is not on this list belongs in Tags.
          </p>
        </div>
        <div>
          <label htmlFor="runbook-tags" className="block text-sm font-medium text-fm-text-secondary mb-1">Tags</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className={inputClass}
            id="runbook-tags"
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
          <label
            htmlFor={`runbook-${field}`}
            className="block text-sm font-medium text-fm-text-secondary mb-1"
          >
            {label} <span className="text-fm-critical">*</span>
          </label>
          <textarea
            id={`runbook-${field}`}
            required
            minLength={10}
            value={form[field] as string}
            onChange={(e) => update(field, e.target.value)}
            className={textareaClass}
            rows={5}
            placeholder={SECTION_PLACEHOLDERS[field]}
          />
          {/* A PERSISTENT hint, not only the placeholder. The placeholder
              already showed the `### Cause` shape and vanished the moment the
              author typed a word of prose — which is exactly how a draft ends
              up saved and then rejected for having no subsection. */}
          {field === 'causes' && (
            <p className="text-xs text-fm-text-tertiary mt-1">
              Needs at least one <code className="font-mono">### Cause</code> subsection, each
              with a <strong>Statement</strong>. Keep the template above as a starting point.
            </p>
          )}
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
