import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserTable } from '../../components/UserTable';
import type { UserProfile } from '../../types/users';

/**
 * The role select can only express the org-scoped vocabulary, and the backend's
 * role assignment REPLACES the whole role list. Offering it for an operator
 * account would therefore silently strip `platform_admin` — a privilege change
 * nobody asked for, from a control whose own label says operator grants happen
 * elsewhere (ADR-012 D9).
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

function renderTable(users: UserProfile[]) {
  const onChangeRole = vi.fn();
  render(
    <table>
      <UserTable users={users} onChangeRole={onChangeRole} onDeactivate={vi.fn()} />
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

  it('does NOT offer the select for a platform admin', () => {
    // Using it would replace the role list and drop `platform_admin`.
    renderTable([makeUser({ roles: ['user', 'admin', 'platform_admin'] })]);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/Platform Admin/)).toBeTruthy();
  });

  it('still offers the select for other rows when one row is an operator', () => {
    renderTable([
      makeUser({ user_id: 'u-1', roles: ['user', 'admin', 'platform_admin'] }),
      makeUser({ user_id: 'u-2', email: 'other@example.com', roles: ['user'] }),
    ]);

    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });
});
