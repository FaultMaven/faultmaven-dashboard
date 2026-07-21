import { describe, it, expect } from 'vitest';
import { canManageConsole, canManageUsers, canViewAllCases } from '../../lib/access';

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

describe('canManageConsole', () => {
  it('allows a platform_admin when the managementConsole capability is on', () => {
    expect(canManageConsole(true, 'platform_admin')).toBe(true);
  });

  it('denies when the capability is off, even for a platform_admin (standalone / pre-P2 cloud)', () => {
    // The capability keys on a live TeamService, NOT deployment === "cloud",
    // so it stays off in Cloud until multi-tenancy is ready (faultmaven#749).
    expect(canManageConsole(false, 'platform_admin')).toBe(false);
  });

  it('denies non-admins even when the capability is on (backend enforces org role)', () => {
    expect(canManageConsole(true, 'standard_user')).toBe(false);
    expect(canManageConsole(true, 'individual')).toBe(false);
  });

  it('denies the loading/unknown role state', () => {
    expect(canManageConsole(true, null)).toBe(false);
    expect(canManageConsole(false, null)).toBe(false);
  });
});

describe('canViewAllCases', () => {
  it('allows a standalone admin (the single operator)', () => {
    expect(canViewAllCases('standalone', true)).toBe(true);
  });

  it('denies a standalone non-admin', () => {
    expect(canViewAllCases('standalone', false)).toBe(false);
  });

  it('denies cloud for now — even an admin (break-glass deferred, backend 403s)', () => {
    expect(canViewAllCases('cloud', true)).toBe(false);
    expect(canViewAllCases('cloud', false)).toBe(false);
  });

  it('denies the loading/unknown state (null deployment)', () => {
    expect(canViewAllCases(null, true)).toBe(false);
    expect(canViewAllCases(null, false)).toBe(false);
  });
});
