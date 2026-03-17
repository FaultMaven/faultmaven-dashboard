import { useState } from 'react';
import type { UserInviteRequest, DashboardRoleValue } from '../types/users';

interface InviteUserModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onInvite: (request: UserInviteRequest) => Promise<void>;
}

const inputClass =
  'w-full px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors text-sm';

export function InviteUserModal({ isOpen, onCancel, onInvite }: InviteUserModalProps) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<DashboardRoleValue>('user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onInvite({ email, username, role });
      setEmail('');
      setUsername('');
      setRole('user');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite user');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEmail('');
    setUsername('');
    setRole('user');
    setError(null);
    onCancel();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
    >
      <div className="bg-fm-surface border border-fm-border rounded-fm-card p-6 w-full max-w-md shadow-fm-card">
        <h3 className="text-lg font-semibold text-fm-text-primary mb-4" id="invite-modal-title">
          Invite User
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fm-text-secondary mb-1">
              Email <span className="text-fm-critical">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="user@example.com"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fm-text-secondary mb-1">
              Username <span className="text-fm-critical">*</span>
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              placeholder="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fm-text-secondary mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as DashboardRoleValue)}
              className={inputClass}
            >
              <option value="user">Standard User</option>
              <option value="admin">Platform Admin</option>
            </select>
          </div>

          {error && (
            <p className="text-xs text-fm-critical">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
            >
              {loading ? 'Inviting...' : 'Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
