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
  // still guards on THIS, so a standalone operator keeps the route — asserted
  // on App's real route table in `adminCasesRoute.test.tsx`, because that is
  // the wiring a bookmark actually arrives through.
  //
  // No arity assertion here. `Function.length` stops counting at the first
  // parameter with a default, so `(isAdmin, deployment = null)` reports 1 and
  // a gate reading the deployment from module scope reports 1 too — it cannot
  // express "deployment-blind". The two behavioural cases above already fail
  // on anything that changes the answer.
});

describe('offersAllCasesNav', () => {
  it('offers it to the cloud operator', () => {
    expect(offersAllCasesNav('cloud', true)).toBe(true);
  });

  it('denies a cloud non-operator', () => {
    expect(offersAllCasesNav('cloud', false)).toBe(false);
  });

  it('withholds it in standalone even from the operator', () => {
    // Standalone re-grants the operator roles to its ONE bootstrap account on
    // every startup and serves the `full` arm, so on the single-account
    // deployment the view is that account's own cases — a copy of `Cases`.
    expect(offersAllCasesNav('standalone', true)).toBe(false);
  });

  it('still offers it while the deployment is unconfirmed', () => {
    // `null` is the real state on every hard refresh and for as long as
    // `/auth/config` is unreachable — AuthContext gates `loading` on the auth
    // load alone. Requiring a confirmed 'cloud' would take the item away from
    // the CLOUD operator in both windows, which is a change to the deployment
    // this fix does not touch. Pinned so a later `=== 'cloud'` cannot land it.
    expect(offersAllCasesNav(null, true)).toBe(true);
  });

  it('is byte-identical to the old gate everywhere except standalone', () => {
    // The scope claim, as an assertion: cloud and the unconfirmed window must
    // answer exactly what `canViewAllCases(isAdmin)` answered before this
    // predicate existed.
    for (const deployment of ['cloud', null] as const) {
      for (const isAdmin of [true, false]) {
        expect(offersAllCasesNav(deployment, isAdmin)).toBe(canViewAllCases(isAdmin));
      }
    }
  });

  it('never offers it to a non-operator, in any deployment', () => {
    // The offer may differ from the guard on DEPLOYMENT — that is its whole
    // purpose — but never on who counts as an operator. A standalone
    // non-operator is refused by BOTH halves, so this pins that widening the
    // deployment half alone cannot let one through.
    for (const deployment of ['cloud', 'standalone', null] as const) {
      expect(offersAllCasesNav(deployment, false)).toBe(false);
    }
  });
});
