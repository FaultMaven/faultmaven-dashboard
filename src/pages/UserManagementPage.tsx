import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { UserTable } from '../components/UserTable';
import { InviteUserModal } from '../components/InviteUserModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PaginationControls } from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { listUsers, inviteUser, updateUserRole, removeUser, logoutAuth } from '../lib/api';
import type { UserProfile, DashboardRoleValue, UserInviteRequest } from '../types/users';

const PAGE_SIZE = 50;

export default function UserManagementPage() {
  const { clearAuthState } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  const loadUsers = async (nextPage = 0) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listUsers(nextPage, PAGE_SIZE);
      setUsers(res.users);
      setTotalCount(res.total_count);
      setPage(nextPage);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load users';
      // Show friendly message for pending backend endpoint
      if (msg.includes('404') || msg.includes('501') || msg.includes('not found')) {
        setError('User management is not yet available in this deployment. Backend endpoint coming soon.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(0);
  }, []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(term) ||
        u.username.toLowerCase().includes(term) ||
        (u.display_name ?? '').toLowerCase().includes(term)
    );
  }, [users, search]);

  const handleChangeRole = async (userId: string, role: DashboardRoleValue) => {
    setActionError(null);
    try {
      await updateUserRole(userId, { role });
      await loadUsers(page);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleRemove = async () => {
    if (!confirmRemoveId) return;
    setActionError(null);
    try {
      await removeUser(confirmRemoveId);
      await loadUsers(page);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove user');
    } finally {
      setConfirmRemoveId(null);
    }
  };

  const handleInvite = async (request: UserInviteRequest) => {
    await inviteUser(request);
    setShowInviteModal(false);
    await loadUsers(0);
  };

  const inputClass =
    'px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">Users</h2>
            <p className="text-fm-text-secondary text-sm">{totalCount} user{totalCount !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors"
          >
            Invite User
          </button>
        </div>

        <div className="mb-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className={`max-w-md ${inputClass}`}
            aria-label="Search users"
          />
        </div>

        {error && (
          <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {error}
          </div>
        )}

        {actionError && (
          <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {actionError}
          </div>
        )}

        <div className="bg-fm-surface rounded-fm-card border border-fm-border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-fm-text-tertiary text-sm">Loading users...</div>
          ) : (
            <UserTable
              users={filteredUsers}
              onChangeRole={handleChangeRole}
              onRemove={(id) => setConfirmRemoveId(id)}
            />
          )}
        </div>

        <PaginationControls
          page={page}
          pageSize={PAGE_SIZE}
          total={totalCount}
          onPageChange={loadUsers}
        />
      </main>

      <InviteUserModal
        isOpen={showInviteModal}
        onCancel={() => setShowInviteModal(false)}
        onInvite={handleInvite}
      />

      <ConfirmDialog
        isOpen={!!confirmRemoveId}
        title="Remove User"
        message="Remove this user from the platform? They will lose access immediately."
        confirmLabel="Remove"
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemoveId(null)}
      />
    </div>
  );
}
