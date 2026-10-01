import type { UserProfile, DashboardRoleValue } from '../types/users';

/**
 * One home for the two org-role labels, so the select's options and the
 * read-only rendering on a locked row cannot drift apart.
 */
const ROLE_LABELS: Record<DashboardRoleValue, string> = {
  user: 'Standard User',
  admin: 'Organization Admin',
};

/** How an account's kind reads in the table: a person, or an integration's agent. */
function kindLabel(user: UserProfile): string {
  if (user.account_kind !== 'service') return 'Person';
  return user.service_channel ? `Service · ${user.service_channel}` : 'Service';
}

interface UserTableProps {
  users: UserProfile[];
  onChangeRole: (userId: string, role: DashboardRoleValue) => void;
  onDeactivate: (userId: string) => void;
  /**
   * The signed-in account, so this table can decline to offer a write the
   * backend refuses. `null`/absent means "unknown", and no row is treated as
   * the caller's own — the backend's 403 is still the thing that decides.
   */
  currentUserId?: string | null;
}

export function UserTable({ users, onChangeRole, onDeactivate, currentUserId }: UserTableProps) {
  if (users.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-fm-text-tertiary text-sm">No users found.</p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-fm-elevated border-b border-fm-border">
        <tr>
          <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">User</th>
          <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Kind</th>
          <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Company</th>
          <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Role</th>
          <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Last Login</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-fm-border">
        {users.map((user) => {
          const role: DashboardRoleValue = user.roles.includes('admin') ? 'admin' : 'user';
          // `platform_admin` is the DEPLOYMENT operator role (ADR-012 D9),
          // granted and revoked only by the fm-promote-platform-admin /
          // fm-demote-platform-admin commands. It used to lock this control,
          // because role assignment replaced the whole role list and would have
          // silently stripped it. It no longer does: `POST /admin/users/{id}/roles`
          // replaces only the org-scoped axis (`admin`/`member`/`viewer`) and
          // preserves every other role (faultmaven#706). So the operator status
          // is shown ALONGSIDE the select, not instead of it — the badge is
          // information, not a lock.
          const isOperator = user.roles.includes('platform_admin');
          // The backend refuses a caller's role write against their own account
          // ("Cannot modify your own roles", 403), so do not offer it. Until
          // #78 this row was locked only incidentally: whoever can reach this
          // page holds `platform_admin`, so the operator lock happened to cover
          // it too. Removing that lock makes the self case explicit rather than
          // a side effect.
          const isSelf = !!currentUserId && user.user_id === currentUserId;
          // `manageable` is the server's answer to "may this operator administer
          // this account" — false for an account outside the operator's
          // enterprise under multi-tenancy, where the role and deactivate routes
          // answer 404. Such a row's `roles` is `[]` meaning NOT REPORTED, not
          // "holds no role", so it renders no role at all rather than a
          // "Standard User" the account may not be.
          const { manageable } = user;
          return (
            <tr key={user.user_id} className="hover:bg-fm-elevated/50 transition-colors">
              <td className="px-4 py-3">
                <p className="font-medium text-fm-text-primary">{user.full_name || user.email}</p>
                <p className="text-xs text-fm-text-tertiary mt-0.5">{user.email}</p>
              </td>
              <td className="px-4 py-3 text-fm-text-secondary">{kindLabel(user)}</td>
              <td className="px-4 py-3">
                {manageable ? (
                  <span className="text-fm-text-secondary">Yours</span>
                ) : (
                  <span className="font-mono text-xs text-fm-text-tertiary" title={user.enterprise_id}>
                    {user.enterprise_id.slice(0, 8)}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col items-start gap-1">
                  {!manageable ? (
                    <span
                      className="text-sm text-fm-text-tertiary"
                      title="Roles are reported only for accounts in your company, and only those can be changed here."
                    >
                      —
                    </span>
                  ) : isSelf ? (
                    <span
                      className="inline-flex items-center gap-1 text-sm text-fm-text-secondary"
                      title="You cannot change your own role — another administrator has to."
                    >
                      {ROLE_LABELS[role]}
                      <span className="text-xs text-fm-text-tertiary">(you)</span>
                    </span>
                  ) : (
                    <select
                      aria-label={`Role for ${user.email}`}
                      value={role}
                      onChange={(e) => onChangeRole(user.user_id, e.target.value as DashboardRoleValue)}
                      className="px-2 py-1 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors"
                    >
                      <option value="user">{ROLE_LABELS.user}</option>
                      <option value="admin">{ROLE_LABELS.admin}</option>
                    </select>
                  )}
                  {isOperator && (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-fm-text-secondary"
                      title="Platform admin (deployment operator). Granted and revoked only with the fm-promote-platform-admin / fm-demote-platform-admin operator commands — changing the organization role here leaves it untouched."
                    >
                      👑 Platform Admin
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-fm-text-tertiary">
                {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                {manageable && (
                  <button
                    onClick={() => onDeactivate(user.user_id)}
                    className="text-xs text-fm-text-tertiary hover:text-fm-critical transition-colors"
                  >
                    Deactivate
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
