import { describe, it, expect } from 'vitest';
import { canManageUsers } from '../../lib/access';

describe('canManageUsers', () => {
  it('allows only cloud platform_admin', () => {
    expect(canManageUsers('cloud', 'platform_admin')).toBe(true);
  });

  it('denies standalone (single-operator) even though the standalone operator is admin', () => {
    // In standalone mode the role is forced to "individual", so this is the path
    // that previously leaked /admin/users by direct URL.
    expect(canManageUsers('standalone', 'individual')).toBe(false);
    // Defensive: even an unexpected standalone+platform_admin pair stays denied.
    expect(canManageUsers('standalone', 'platform_admin')).toBe(false);
  });

  it('denies cloud non-admins', () => {
    expect(canManageUsers('cloud', 'standard_user')).toBe(false);
    expect(canManageUsers('cloud', 'individual')).toBe(false);
  });

  it('denies the loading/unknown state (null deployment or role)', () => {
    expect(canManageUsers(null, null)).toBe(false);
    expect(canManageUsers('cloud', null)).toBe(false);
    expect(canManageUsers(null, 'platform_admin')).toBe(false);
  });
});
