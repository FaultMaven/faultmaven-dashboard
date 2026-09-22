import { describe, it, expect } from 'vitest';
import {
  canManageConsole,
  canManageUsers,
  canUseTeams,
  canViewAllCases,
  offersAllCasesNav,
} from '../../lib/access';

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
  it('allows the platform_admin operator', () => {
    expect(canViewAllCases(true)).toBe(true);
  });

  it('denies a non-operator', () => {
    expect(canViewAllCases(false)).toBe(false);
  });

  // No deployment case here on purpose: ADR-012 D9 makes deployment decide the
  // COLUMNS, not the access, so this predicate takes no deployment at all and
  // there is no deployment-dependent behaviour left to assert. The behavioural
  // guard against a deployment gate creeping back in lives in
  // `useNavigationItems.test.ts`, which pins that a cloud platform_admin still
  // sees the "All Cases" item.
  //
  // The NAV OFFER is deployment-gated, and that is not this predicate leaking:
  // `offersAllCasesNav` below is a separate question (is the item worth a nav
  // slot?) from this one (may this caller reach the page?). `/admin/cases`
  // still guards on THIS, so a standalone operator keeps the route.
  it('is the route guard, and stays deployment-blind', () => {
    // The signature is the assertion. A `deployment` parameter added back here
    // would take the route away from the standalone operator, which is the one
    // thing hiding the nav item deliberately does not do.
    expect(canViewAllCases).toHaveLength(1);
  });
});

describe('offersAllCasesNav', () => {
  it('offers it to the cloud operator', () => {
    expect(offersAllCasesNav('cloud', true)).toBe(true);
  });

  it('denies a cloud non-operator', () => {
    expect(offersAllCasesNav('cloud', false)).toBe(false);
  });

  it('withholds it in standalone even from the operator', () => {
    // Standalone re-grants `platform_admin` to its one bootstrap account on
    // every startup, and serves the `full` arm over a server whose entire case
    // set belongs to that account — so the item duplicates `Cases`.
    expect(offersAllCasesNav('standalone', true)).toBe(false);
  });

  it('withholds it while the deployment is unconfirmed', () => {
    // `null` is the real state on a hard refresh and for as long as
    // `/auth/config` is unreachable — AuthContext gates `loading` on the auth
    // load alone. Showing it here and retracting it a moment later would
    // flicker exactly the item this removes.
    expect(offersAllCasesNav(null, true)).toBe(false);
  });

  it('defers the role half to canViewAllCases rather than restating it', () => {
    // Anti-drift: the offer may differ from the guard on DEPLOYMENT (that is
    // its whole purpose) but never on who counts as an operator. Restating
    // `isAdmin` here is how the two would come apart.
    for (const isAdmin of [true, false]) {
      expect(offersAllCasesNav('cloud', isAdmin)).toBe(canViewAllCases(isAdmin));
    }
  });
});
