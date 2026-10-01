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
    enterprise_id: 'ent-1',
    account_kind: 'individual',
    service_channel: null,
    manageable: true,
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

/**
 * Under multi-tenancy the list spans every enterprise, and the server marks the
 * rows the operator can administer with `manageable`. A row outside the
 * operator's enterprise carries `roles: []` meaning NOT REPORTED, and its role
 * and deactivate routes answer 404 — so it offers neither control and claims
 * no role at all (it used to render as "Standard User").
 */
describe('UserTable rows the operator cannot administer', () => {
  const foreign = () =>
    makeUser({
      user_id: 'u-foreign',
      email: 'someone@other.example',
      roles: [],
      manageable: false,
      enterprise_id: '7f3a9c21-0000-4000-8000-000000000000',
    });

  it('offers no role select and no deactivate button', () => {
    renderTable([foreign()]);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();
  });

  it('says the role is not reported, in visible text, instead of claiming one', () => {
    renderTable([foreign()]);

    expect(screen.queryByText('Standard User')).toBeNull();
    expect(screen.getByText('Not reported — you cannot administer this account')).toBeTruthy();
  });

  it('keeps both controls on the rows the operator can administer', () => {
    renderTable([foreign(), makeUser({ user_id: 'u-mine', email: 'mine@example.com' })]);

    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Deactivate' })).toHaveLength(1);
  });
});

/**
 * A server before contract 10.0.0 sends no `manageable` (and no
 * `account_kind`): its list was confined to the operator's enterprise, so every
 * row is administrable. Absence must read as manageable, or this build running
 * ahead of the API would strip every control from the page.
 */
describe('UserTable against a server that predates contract 10.0.0', () => {
  const legacyRow = (): UserProfile => {
    const row = makeUser({
      user_id: 'u-legacy',
      email: 'legacy@example.com',
      full_name: 'Lee Legacy',
    }) as Record<string, unknown>;
    delete row.manageable;
    delete row.account_kind;
    delete row.service_channel;
    return row as unknown as UserProfile;
  };

  it('treats a row without `manageable` as administrable', () => {
    renderTable([legacyRow()]);

    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeTruthy();
    expect(screen.queryByText(/Not reported/)).toBeNull();
  });

  it('reads a row without `account_kind` as a person', () => {
    renderTable([legacyRow()]);

    expect(screen.getByText('Person')).toBeTruthy();
    expect(screen.queryByText('Service account')).toBeNull();
  });
});

describe('UserTable enterprise column', () => {
  it("shows every row's enterprise id whole, as visible text", () => {
    renderTable([
      makeUser({ user_id: 'a', email: 'a@x.example', enterprise_id: '00000000-0000-0000-0000-000000000002' }),
      makeUser({ user_id: 'b', email: 'b@y.example', enterprise_id: '00000000-0000-0000-0000-00000000000f', manageable: false, roles: [] }),
    ]);

    // Two ids sharing their first eight characters stay distinguishable.
    expect(screen.getByText('00000000-0000-0000-0000-000000000002')).toBeTruthy();
    expect(screen.getByText('00000000-0000-0000-0000-00000000000f')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Enterprise' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Company' })).toBeNull();
  });
});

describe('UserTable deactivate offer', () => {
  it("is not offered on the signed-in operator's own row (the backend answers 403)", () => {
    renderTable([makeUser({ user_id: 'u-me', email: 'me@example.com' })], 'u-me');

    expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();
  });

  it('is not offered on an account already inactive (409), which is marked as such', () => {
    renderTable([makeUser({ is_active: false })]);

    expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('hands the whole row to the caller, so the confirmation can describe it', () => {
    const onDeactivate = vi.fn();
    const row = makeUser({ account_kind: 'service', service_channel: 'slack' });
    render(
      <table>
        <UserTable users={[row]} onChangeRole={vi.fn()} onDeactivate={onDeactivate} />
      </table>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(onDeactivate).toHaveBeenCalledWith(row);
  });
});

/**
 * A service account is an integration's agent, not a person: it is made to
 * stand out beside its name and in the Kind column, its org role is shown but
 * never edited, and it stays deactivatable — the integration's kill switch.
 */
describe('UserTable service accounts', () => {
  const service = () =>
    makeUser({ full_name: 'slack-T0B9', account_kind: 'service', service_channel: 'slack' });

  it('is badged beside its name and in the Kind column', () => {
    renderTable([service()]);

    expect(screen.getByText('Service account')).toBeTruthy();
    expect(screen.getByText('Service · slack')).toBeTruthy();
  });

  it('shows its role read-only, with no select', () => {
    renderTable([service()]);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Standard User')).toBeTruthy();
  });

  it('keeps Deactivate', () => {
    renderTable([service()]);

    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeTruthy();
  });

  it('reads a person as a person, with no service badge', () => {
    renderTable([makeUser({ full_name: 'Ada Lovelace' })]);

    expect(screen.getByText('Person')).toBeTruthy();
    expect(screen.queryByText('Service account')).toBeNull();
  });
});
