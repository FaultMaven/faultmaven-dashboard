import type { UserProfile, DashboardRoleValue } from '../types/users';

interface UserTableProps {
  users: UserProfile[];
  onChangeRole: (userId: string, role: DashboardRoleValue) => void;
  onDeactivate: (userId: string) => void;
}

export function UserTable({ users, onChangeRole, onDeactivate }: UserTableProps) {
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
          <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Role</th>
          <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Last Login</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-fm-border">
        {users.map((user) => {
          const role: DashboardRoleValue = user.roles.includes('admin') ? 'admin' : 'user';
          return (
            <tr key={user.user_id} className="hover:bg-fm-elevated/50 transition-colors">
              <td className="px-4 py-3">
                <p className="font-medium text-fm-text-primary">{user.full_name || user.email}</p>
                <p className="text-xs text-fm-text-tertiary mt-0.5">{user.email}</p>
              </td>
              <td className="px-4 py-3">
                <select
                  value={role}
                  onChange={(e) => onChangeRole(user.user_id, e.target.value as DashboardRoleValue)}
                  className="px-2 py-1 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors"
                >
                  {/* Org-scoped role only; `platform_admin` is granted by
                      operator CLI, never from this UI (ADR-012 D9). */}
                  <option value="user">Standard User</option>
                  <option value="admin">Organization Admin</option>
                </select>
              </td>
              <td className="px-4 py-3 text-fm-text-tertiary">
                {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onDeactivate(user.user_id)}
                  className="text-xs text-fm-text-tertiary hover:text-fm-critical transition-colors"
                >
                  Deactivate
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
