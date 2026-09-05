import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { UserTable } from '../../components/UserTable';
import type { UserProfile } from '../../types/users';

/**
 * The role select writes the ORG-SCOPED axis, and the backend replaces only
 * that axis — `platform_admin` and the base `user` marker survive an assignment
 * (faultmaven#706). So an operator's org role is editable from this table like
 * anyone else's, and the operator badge is status shown ALONGSIDE the control.
 *
 * The one row that must not offer it is the caller's own: the backend answers
 * 403 "Cannot modify your own roles". Before #78 that row was covered only
 * incidentally, by the operator lock; these tests hold the explicit lock in
 * place now that the incidental one is gone.
 */

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    user_id: 'u-1',
    email: 'person@example.com',
    full_name: 'Person',
    roles: ['user'],
    is_active: true,
    is_verified: true,
    last_login_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    organization_id: 'org-1',
    ...overrides,
  } as UserProfile;
}

function renderTable(users: UserProfile[], currentUserId?: string | null) {
  const onChangeRole = vi.fn();
  render(
    <table>
      <UserTable
        users={users}
        onChangeRole={onChangeRole}
        onDeactivate={vi.fn()}
        currentUserId={currentUserId}
      />
    </table>,
  );
  return { onChangeRole };
}

describe('UserTable role control', () => {
  it('offers the org-role select for a non-operator', () => {
    renderTable([makeUser({ roles: ['user'] })]);

    const select = screen.getByRole('combobox');
    expect(select).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Organization Admin' })).toBeTruthy();
  });

  it('reflects an existing org admin in the select', () => {
    renderTable([makeUser({ roles: ['user', 'admin'] })]);

    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('admin');
  });

  it('offers the select for a platform admin, and keeps the operator badge', () => {
    // fm#1039/#706: assigning an org role preserves `platform_admin`, so there
    // is nothing left for this control to strip and no reason to lock it.
    renderTable([makeUser({ roles: ['user', 'admin', 'platform_admin'] })]);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('admin');
    expect(screen.getByRole('option', { name: 'Standard User' })).toBeTruthy();
    // The badge is information about the account, not the absence of a control.
    expect(screen.getByText(/Platform Admin/)).toBeTruthy();
  });

  it('an operator row asks for the org role alone, not a rebuilt role list', () => {
    const { onChangeRole } = renderTable([
      makeUser({ user_id: 'u-op', roles: ['user', 'member', 'platform_admin'] }),
    ]);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'admin' } });

    expect(onChangeRole).toHaveBeenCalledWith('u-op', 'admin');
  });

  it('offers the select on every row when one row is an operator', () => {
    renderTable([
      makeUser({ user_id: 'u-1', roles: ['user', 'admin', 'platform_admin'] }),
      makeUser({ user_id: 'u-2', email: 'other@example.com', roles: ['user'] }),
    ]);

    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it("locks the role control on the signed-in account's own row", () => {
    // The backend refuses this write (403 "Cannot modify your own roles"), so
    // the UI must not offer it — and must still say what the role IS.
    renderTable(
      [
        makeUser({ user_id: 'u-me', email: 'me@example.com', roles: ['user', 'admin', 'platform_admin'] }),
        makeUser({ user_id: 'u-other', email: 'other@example.com', roles: ['user'] }),
      ],
      'u-me',
    );

    expect(screen.queryByLabelText('Role for me@example.com')).toBeNull();
    const selfCell = screen.getByText('(you)').closest('td') as HTMLElement;
    // Locked, but the role is still stated — a lock must not hide the value.
    expect(within(selfCell).queryByRole('combobox')).toBeNull();
    expect(within(selfCell).getByText('Organization Admin')).toBeTruthy();
    // Every other row keeps its control.
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByLabelText('Role for other@example.com')).toBeTruthy();
  });

  it('locks no row when the signed-in account is unknown', () => {
    renderTable([makeUser({ user_id: 'u-1' }), makeUser({ user_id: 'u-2', email: 'b@example.com' })], null);

    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.queryByText('(you)')).toBeNull();
  });
});
