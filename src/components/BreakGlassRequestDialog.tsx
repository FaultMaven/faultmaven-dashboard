import { useState } from 'react';
import { requestBreakGlassGrant } from '../lib/breakGlass/api';
import type { BreakGlassGrant } from '../types/cases';

/**
 * The justification floor the backend enforces (`MIN_GRANT_REASON_LENGTH`).
 *
 * Mirrored here so the form can say what it wants *before* a round trip, not so
 * the rule lives in two places: the backend rejects a short reason regardless,
 * and this only decides when the submit button lights up.
 */
const MIN_REASON_LENGTH = 20;

/** Windows the backend accepts (its ceiling is 240 minutes). */
const TTL_OPTIONS = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: '4 hours' },
];

interface BreakGlassRequestDialogProps {
  caseId: string;
  organizationId: string;
  onGranted: (grant: BreakGlassGrant) => void;
  onCancel: () => void;
}

/**
 * Request time-boxed access to one case's content (ADR-012 D9).
 *
 * The dialog asks for the two things that make the access reviewable — why, and
 * for how long — and says plainly that both are recorded. It deliberately does
 * not offer an "extend" affordance anywhere: needing longer means coming back
 * here and writing a fresh justification, which is what stops a grant drifting
 * into standing access.
 *
 * The grant is live the moment it is created. The control is the justification,
 * the window and an immutable trail of every read taken under it — not a second
 * party's approval, which arrives with the customer-initiated posture the
 * backend already carries the state machine for.
 */
export function BreakGlassRequestDialog({
  caseId,
  organizationId,
  onGranted,
  onCancel,
}: BreakGlassRequestDialogProps) {
  const [reason, setReason] = useState('');
  const [ttlMinutes, setTtlMinutes] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Measured on the trimmed value, matching the backend: a reason padded to
  // length with whitespace is rejected there, so enabling submit on the raw
  // length would offer a button that can only fail.
  const reasonIsSufficient = reason.trim().length >= MIN_REASON_LENGTH;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const grant = await requestBreakGlassGrant({
        caseId,
        organizationId,
        reason: reason.trim(),
        ttlMinutes,
      });
      onGranted(grant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request access');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="break-glass-title"
        className="bg-fm-surface border border-fm-border rounded-fm-card w-full max-w-lg p-6"
      >
        <h3 id="break-glass-title" className="text-fm-heading font-bold text-fm-text-primary mb-1">
          Request access to case content
        </h3>
        <p className="text-sm text-fm-text-secondary mb-4">
          Opening this case discloses its title, description and transcript. Your reason and every
          read taken under this grant are recorded in a trail that cannot be edited or deleted.
        </p>

        <p className="text-xs text-fm-text-tertiary font-mono mb-4 select-all">{caseId}</p>

        <label
          htmlFor="break-glass-reason"
          className="block text-sm font-medium text-fm-text-primary mb-1"
        >
          Why do you need this?
        </label>
        <textarea
          id="break-glass-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. customer reports the investigation is stuck; ticket SUP-4821"
          className="w-full px-3 py-2 bg-fm-canvas border border-fm-border rounded-fm-btn text-sm text-fm-text-primary placeholder:text-fm-text-tertiary focus:outline-none focus:border-fm-accent"
        />
        <p className="text-xs text-fm-text-tertiary mt-1 mb-4">
          {reasonIsSufficient
            ? 'A reviewer will read this alongside every access it authorises.'
            : `At least ${MIN_REASON_LENGTH} characters.`}
        </p>

        <label
          htmlFor="break-glass-ttl"
          className="block text-sm font-medium text-fm-text-primary mb-1"
        >
          Access expires after
        </label>
        <select
          id="break-glass-ttl"
          value={ttlMinutes}
          onChange={(e) => setTtlMinutes(Number(e.target.value))}
          className="w-full px-3 py-2 bg-fm-canvas border border-fm-border rounded-fm-btn text-sm text-fm-text-primary focus:outline-none focus:border-fm-accent"
        >
          {TTL_OPTIONS.map(({ minutes, label }) => (
            <option key={minutes} value={minutes}>
              {label}
            </option>
          ))}
        </select>
        <p className="text-xs text-fm-text-tertiary mt-1 mb-4">
          A grant cannot be extended. If you need longer afterwards, request a new one.
        </p>

        {error && (
          <div className="text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3 mb-4">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm text-fm-text-secondary hover:text-fm-text-primary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reasonIsSufficient || submitting}
            className="px-4 py-2 text-sm bg-fm-accent text-white rounded-fm-btn hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Requesting...' : 'Request access'}
          </button>
        </div>
      </div>
    </div>
  );
}
