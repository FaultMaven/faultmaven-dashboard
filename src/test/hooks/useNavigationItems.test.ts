import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNavigationItems } from '../../hooks/useNavigationItems';

// Mock AuthContext to control deployment and role
vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock the capabilities hook: the Organization console item gates on
// managementConsole and the Teams item on teamSharing. Both default OFF so
// existing cases (which don't expect either) hold.
const mockUseCapabilities = vi.fn();
vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => mockUseCapabilities(),
}));

import { useAuth } from '../../context/AuthContext';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

describe('useNavigationItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCapabilities.mockReturnValue({ managementConsole: false, teamSharing: false });
  });

  it('standalone operator sees Cases, Knowledge Base, LLM Settings — no Users', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      role: 'individual',
      isAdmin: true,
    });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const labels = result.current.map((i) => i.label);

    expect(labels).toContain('Cases');
    expect(labels).toContain('Knowledge Base');
    expect(labels).toContain('LLM Settings');
    expect(labels).not.toContain('Users');
  });

  it('standalone NON-operator does not see LLM Settings', () => {
    // LLM configuration is operator-only on the backend (ADR-012 D9). Offering
    // the nav item to any standalone account would send non-operators to a page
    // that 403s on every request behind it.
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      role: 'individual',
      isAdmin: false,
    });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const labels = result.current.map((i) => i.label);

    expect(labels).toContain('Cases');
    expect(labels).not.toContain('LLM Settings');
  });

  it('cloud standard_user sees Cases, Knowledge Base — no LLM Settings, no Users', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      role: 'standard_user',
      isAdmin: false,
    });

    const { result } = renderHook(() => useNavigationItems('/kb'));
    const labels = result.current.map((i) => i.label);

    expect(labels).toContain('Cases');
    expect(labels).toContain('Knowledge Base');
    expect(labels).not.toContain('LLM Settings');
    expect(labels).not.toContain('Users');
  });

  it('cloud platform_admin sees all four nav items', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      role: 'platform_admin',
      isAdmin: true,
    });

    const { result } = renderHook(() => useNavigationItems('/admin/users'));
    const labels = result.current.map((i) => i.label);

    expect(labels).toContain('Cases');
    expect(labels).toContain('Knowledge Base');
    expect(labels).toContain('LLM Settings');
    expect(labels).toContain('Users');
  });

  it('marks item active when currentPath matches exactly', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      role: 'individual',
      isAdmin: true,
    });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const casesItem = result.current.find((i) => i.path === '/cases');

    expect(casesItem?.active).toBe(true);
  });

  it('marks item active when currentPath is a sub-path', () => {
    mockUseAuth.mockReturnValue({ deployment: 'standalone', role: 'individual' });

    const { result } = renderHook(() => useNavigationItems('/cases/abc-123'));
    const casesItem = result.current.find((i) => i.path === '/cases');
    const kbItem = result.current.find((i) => i.path === '/kb');

    expect(casesItem?.active).toBe(true);
    expect(kbItem?.active).toBe(false);
  });

  it('no item is active when path does not match any nav item', () => {
    mockUseAuth.mockReturnValue({ deployment: 'standalone', role: 'individual' });

    const { result } = renderHook(() => useNavigationItems('/login'));
    const anyActive = result.current.some((i) => i.active);

    expect(anyActive).toBe(false);
  });

  it('null deployment/role shows base items only (loading state)', () => {
    mockUseAuth.mockReturnValue({ deployment: null, role: null });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const labels = result.current.map((i) => i.label);

    expect(labels).toContain('Cases');
    expect(labels).toContain('Knowledge Base');
    expect(labels).not.toContain('LLM Settings');
    expect(labels).not.toContain('Users');
  });

  it('standalone admin does NOT see "All Cases" — it copies "Cases" there', () => {
    // Standalone bootstraps ONE account and re-grants IT the operator roles on
    // every startup; every other standalone account is an ordinary user. On the
    // single-account deployment that operator owns every case on the server, so
    // the `full` arm serves back the list they already have — measured on a
    // live stack, `GET /cases` and `GET /admin/cases` returned the same 21 ids.
    // Standalone is single-user by design, so that is the whole population,
    // not one install's luck. The ROUTE is denied the same way, by the same
    // predicate — see `canViewAllCases` and `adminCasesRoute.test.tsx`.
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      role: 'individual',
      isAdmin: true,
    });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const labels = result.current.map((i) => i.label);

    expect(labels).not.toContain('All Cases');
    // …and it is the ITEM that went, not the operator's nav as a whole.
    expect(labels).toContain('LLM Settings');
  });

  it('still shows "All Cases" before the deployment is confirmed', () => {
    // AuthContext starts config detection alongside the auth load and blanks
    // pages on the auth load ALONE, so the nav genuinely renders with
    // `deployment: null` — on every hard refresh, and for as long as
    // `/auth/config` is unreachable. `isAdmin` is available synchronously from
    // stored auth state, so requiring a confirmed 'cloud' here would take the
    // item away from the CLOUD operator in both windows. The unconfirmed window
    // therefore keeps its old answer, and the ROUTE waits for detection rather
    // than acting on it. Pinned so a `=== 'cloud'` tightening cannot land here.
    mockUseAuth.mockReturnValue({
      deployment: null,
      role: null,
      isAdmin: true,
    });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const labels = result.current.map((i) => i.label);

    expect(labels).toContain('All Cases');
    // Not vacuous: a hook that emitted nothing at all would satisfy the
    // absence-style assertions elsewhere in this file, so say what else is here.
    expect(labels).toContain('Cases');
  });

  it('standalone non-admin does NOT see "All Cases" either', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      role: 'individual',
      isAdmin: false,
    });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const labels = result.current.map((i) => i.label);

    expect(labels).not.toContain('All Cases');
  });

  it('cloud platform_admin ALSO sees "All Cases" (metadata-only there, ADR-012 D9)', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      role: 'platform_admin',
      isAdmin: true,
    });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const labels = result.current.map((i) => i.label);

    expect(labels).toContain('All Cases');
  });

  it('cloud non-operator does NOT see "All Cases"', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      role: 'standard_user',
      isAdmin: false,
    });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const labels = result.current.map((i) => i.label);

    expect(labels).not.toContain('All Cases');
  });

  it('cloud platform_admin sees "Organization" only when managementConsole is on', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      role: 'platform_admin',
      isAdmin: true,
    });

    // Capability off (standalone / pre-P2 cloud): hidden.
    mockUseCapabilities.mockReturnValue({ managementConsole: false, teamSharing: false });
    let result = renderHook(() => useNavigationItems('/cases')).result;
    expect(result.current.map((i) => i.label)).not.toContain('Organization');

    // Capability on (multi-tenant active): shown.
    mockUseCapabilities.mockReturnValue({ managementConsole: true, teamSharing: false });
    result = renderHook(() => useNavigationItems('/cases')).result;
    expect(result.current.map((i) => i.label)).toContain('Organization');
  });

  it('EVERY signed-in account sees "Teams" wherever the deployment has them', () => {
    // ADR-017 D4: any account may create a team. The item is deliberately not
    // behind platform_admin — the surface it opens is the product's sharing
    // model, not an operator console.
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      role: 'standard_user',
      isAdmin: false,
    });

    mockUseCapabilities.mockReturnValue({ managementConsole: false, teamSharing: false });
    let result = renderHook(() => useNavigationItems('/cases')).result;
    expect(result.current.map((i) => i.label)).not.toContain('Teams');

    mockUseCapabilities.mockReturnValue({ managementConsole: false, teamSharing: true });
    result = renderHook(() => useNavigationItems('/cases')).result;
    expect(result.current.map((i) => i.label)).toContain('Teams');
  });

  it('standalone sees no "Teams" — one enterprise, one account, nobody to invite', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      role: 'individual',
      isAdmin: true,
    });
    mockUseCapabilities.mockReturnValue({ managementConsole: false, teamSharing: false });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    expect(result.current.map((i) => i.label)).not.toContain('Teams');
  });

  it('"New Case" is the FIRST item, for any signed-in account, ungated', () => {
    // ADR-018 D2 point 3 + D5. The full-page surface used to be reachable only
    // by redirect — from sign-in and from an empty case list — so an account
    // that had one case could not get back to it from the nav at all. It is the
    // primary call to action, so it leads; `@faultmaven/copilot-ui` orders its
    // own `+ New Case` the same way.
    //
    // Asserted for the LEAST privileged account there is, because row 3 gates it
    // on nothing: no role, no capability. Row 6 will gate it on a preference
    // that does not exist yet.
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      role: 'standard_user',
      isAdmin: false,
    });

    const { result } = renderHook(() => useNavigationItems('/cases'));

    expect(result.current[0]).toMatchObject({ label: 'New Case', path: '/investigate' });
  });

  it('"New Case" is present in standalone too, where there is no role to gate on', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      role: 'individual',
      isAdmin: false,
    });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const newCase = result.current.find((i) => i.path === '/investigate');

    expect(newCase?.label).toBe('New Case');
  });

  it('marks "New Case" active on /investigate, and nothing else', () => {
    // The route path is `/investigate` while the label is `New Case` (D5 —
    // routes are not copy), so the item is the one place in this hook where the
    // two disagree. If active matching were ever keyed off the label the item
    // would sit unhighlighted on its own page.
    mockUseAuth.mockReturnValue({ deployment: 'standalone', role: 'individual' });

    const { result } = renderHook(() => useNavigationItems('/investigate'));
    const active = result.current.filter((i) => i.active);

    expect(active.map((i) => i.label)).toEqual(['New Case']);
  });

  it('no navigation label calls a case an "investigation" (ADR-018 D5)', () => {
    // A sweep, not an assertion about the one label this change added: the
    // point of D5 is that the NEXT nav label cannot reintroduce the word
    // either. ADR-005 makes an investigation a phase a case enters past
    // INQUIRY, so no navigation item can offer one.
    //
    // The fullest nav there is, so the sweep sees every item the hook can emit.
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      role: 'platform_admin',
      isAdmin: true,
    });
    mockUseCapabilities.mockReturnValue({ managementConsole: true, teamSharing: true });

    const { result } = renderHook(() => useNavigationItems('/cases'));

    expect(result.current.length).toBeGreaterThan(5);
    for (const item of result.current) {
      expect(item.label).not.toMatch(/investigations?\b/i);
    }
  });

  it('cloud standard_user never sees "Organization" even when managementConsole is on', () => {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      role: 'standard_user',
      isAdmin: false,
    });
    mockUseCapabilities.mockReturnValue({ managementConsole: true, teamSharing: false });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    expect(result.current.map((i) => i.label)).not.toContain('Organization');
  });
});
