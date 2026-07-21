import { useState } from 'react';
import { ORG_ROLES, type InviteMemberRequest, type OrgRole } from '../../types/organization';

interface InviteMemberModalProps {
  onCancel: () => void;
  /** Resolves when the invite succeeds (parent closes + refetches). */
  onInvite: (request: InviteMemberRequest) => Promise<void>;
}

/**
 * v1a "invite" (ADR-013; no email flow): add an EXISTING enterprise user to the
 * organization by email OR username, with a role. The backend resolves the user
 * within the caller's enterprise and rejects anyone outside it.
 *
 * The parent mounts this only while open (`{showInvite && <InviteMemberModal/>}`),
 * so each open starts from fresh state — no reset effect needed.
 */
export function InviteMemberModal({ onCancel, onInvite }: InviteMemberModalProps) {
  const [identifierKind, setIdentifierKind] = useState<'email' | 'username'>('email');
  const [identifier, setIdentifier] = useState('');
  const [role, setRole] = useState<OrgRole>('member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    'w-full px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = identifier.trim();
    if (!value) {
      setError('Enter an email or username.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onInvite({
        role,
        ...(identifierKind === 'email' ? { email: value } : { username: value }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-member-title"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-fm-surface border border-fm-border rounded-fm-card p-6 w-full max-w-md shadow-fm-card"
      >
        <h3 className="text-lg font-semibold text-fm-text-primary mb-1" id="invite-member-title">
          Add a member
        </h3>
        <p className="text-sm text-fm-text-secondary mb-4">
          Add an existing user from your enterprise to this organization.
        </p>

        <div className="mb-3">
          <div className="flex gap-2 mb-2" role="radiogroup" aria-label="Identifier type">
            {(['email', 'username'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={identifierKind === kind}
                onClick={() => setIdentifierKind(kind)}
                className={`px-3 py-1 text-xs font-medium rounded-fm-btn border transition-colors ${
                  identifierKind === kind
                    ? 'bg-fm-accent/10 text-fm-accent border-fm-accent/30'
                    : 'text-fm-text-secondary border-fm-border hover:bg-fm-elevated'
                }`}
              >
                {kind === 'email' ? 'Email' : 'Username'}
              </button>
            ))}
          </div>
          <input
            type={identifierKind === 'email' ? 'email' : 'text'}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={identifierKind === 'email' ? 'person@example.com' : 'username'}
            className={inputClass}
            aria-label={identifierKind === 'email' ? 'Email' : 'Username'}
            autoFocus
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-fm-text-secondary mb-1" htmlFor="invite-role">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as OrgRole)}
            className={inputClass}
          >
            {ORG_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-fm-critical mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add member'}
          </button>
        </div>
      </form>
    </div>
  );
}
