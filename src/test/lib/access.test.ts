import { describe, it, expect } from 'vitest';
import { canManageConsole, canManageUsers, canUseTeams, canViewAllCases } from '../../lib/access';

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

describe('canUseTeams', () => {
  it('follows the deployment capability and nothing else', () => {
    expect(canUseTeams(true)).toBe(true);
    expect(canUseTeams(false)).toBe(false);
  });

  it('takes no role at all — any account may create a team (ADR-017 D4)', () => {
    // The signature is the assertion: gating sharing on `platform_admin`, as the
    // old combined console did, would contradict the decision it implements.
    expect(canUseTeams).toHaveLength(1);
  });
});

describe('canViewAllCases', () => {
  it('allows the cloud platform_admin operator', () => {
    expect(canViewAllCases('cloud', true)).toBe(true);
  });

  it('denies a cloud non-operator', () => {
    expect(canViewAllCases('cloud', false)).toBe(false);
  });

  it('denies STANDALONE even to the operator', () => {
    // Standalone is single-user by design, so "every case on the server" and
    // "my cases" are the same list and this view is a weaker copy of `Cases`.
    // It is denied the ROUTE too, not merely left without a nav link — #177
    // kept the route open for the multi-account standalone operator, and that
    // configuration is not supported.
    expect(canViewAllCases('standalone', true)).toBe(false);
  });

  it('denies a standalone non-operator', () => {
    expect(canViewAllCases('standalone', false)).toBe(false);
  });

  it('ALLOWS while the deployment is unconfirmed, rather than failing closed', () => {
    // `null` is the real state on every hard refresh and for as long as
    // `/auth/config` is unreachable. Failing closed would bounce a cloud
    // operator off their own bookmark, for a client check whose authority is
    // the backend. `AllCasesRoute` blanks while configStatus is 'pending' so
    // this branch is reached only when detection has genuinely given up.
    expect(canViewAllCases(null, true)).toBe(true);
  });

  it('still needs the operator role when the deployment is unconfirmed', () => {
    // Failing open on DEPLOYMENT must not fail open on the role.
    expect(canViewAllCases(null, false)).toBe(false);
  });

  // No arity assertion. `Function.length` stops counting at the first parameter
  // with a default, so it cannot express a signature claim. The behavioural
  // cases above already fail on anything that changes an answer.
  //
  // ONE predicate for the nav item and the route: `offersAllCasesNav` is gone.
  // The route half is asserted on App's real route table in
  // `src/test/pages/adminCasesRoute.test.tsx`.
});
