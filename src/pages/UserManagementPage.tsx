import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { UserTable } from '../components/UserTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PaginationControls } from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { listUsers, updateUserRole, deactivateUser, logoutAuth } from '../lib/api';
import type { UserProfile, DashboardRoleValue } from '../types/users';

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * What deactivating this account does, in words that fit it. A person loses
 * access; an integration's service account is the integration's identity, so
 * deactivating it stops that integration for its whole enterprise — the
 * deliberate kill switch, worth naming before the click.
 */
function deactivateMessage(user: UserProfile | null): string {
  if (user?.account_kind === 'service') {
    const integration = user.service_channel ? `The ${user.service_channel} integration` : 'The integration';
    return `Deactivate this service account? ${integration} it serves stops working immediately for its enterprise, and its active sessions are revoked.`;
  }
  return 'Deactivate this user? They will lose access immediately and all their active sessions are revoked.';
}

export default function UserManagementPage() {
  const { clearAuthState, authState } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [confirmDeactivate, setConfirmDeactivate] = useState<UserProfile | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  // The search goes to the SERVER. Filtering only the page already loaded
  // would miss every account on another page — and once the list spans every
  // enterprise (contract 10.0.0, multi-tenant) the operator's own accounts are
  // scattered across those pages.
  const loadUsers = async (nextPage = 0, term = search) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listUsers(nextPage, PAGE_SIZE, term.trim() || undefined);
      setUsers(res.users);
      setTotalCount(res.total);
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

  // Debounced, and always from the first page: a new search is a new result
  // set, and the page the operator was on may not exist in it.
  useEffect(() => {
    const handle = setTimeout(() => {
      loadUsers(0, search);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadUsers is recreated each render; the search term is the only trigger
  }, [search]);

  // The roles the table shows after a write are the SERVER's, never a list
  // rebuilt here from the select value. Rebuilding it locally would render an
  // operator as holding only the org role just assigned and drop
  // `platform_admin` from the row — a privilege change the backend did not
  // make (it replaces the org-scoped axis alone, faultmaven#706) and this page
  // would have invented. The refetch is what makes that impossible.
  const handleChangeRole = async (userId: string, role: DashboardRoleValue) => {
    setActionError(null);
    try {
      await updateUserRole(userId, { role });
      await loadUsers(page);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDeactivate) return;
    setActionError(null);
    try {
      await deactivateUser(confirmDeactivate.user_id);
      await loadUsers(page);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to deactivate user');
    } finally {
      setConfirmDeactivate(null);
    }
  };

  const inputClass =
    'px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">Users</h2>
          <p className="text-fm-text-secondary text-sm">{totalCount} user{totalCount !== 1 ? 's' : ''}</p>
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
              users={users}
              onChangeRole={handleChangeRole}
              onDeactivate={(user) => setConfirmDeactivate(user)}
              currentUserId={authState?.user?.user_id ?? null}
            />
          )}
        </div>

        <PaginationControls
          page={page}
          pageSize={PAGE_SIZE}
          total={totalCount}
          onPageChange={(next) => loadUsers(next)}
        />
      </main>

      <ConfirmDialog
        isOpen={!!confirmDeactivate}
        title={
          confirmDeactivate?.account_kind === 'service'
            ? 'Deactivate Service Account'
            : 'Deactivate User'
        }
        message={deactivateMessage(confirmDeactivate)}
        confirmLabel="Deactivate"
        onConfirm={handleDeactivate}
        onCancel={() => setConfirmDeactivate(null)}
      />
    </div>
  );
}
