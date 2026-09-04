import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config', () => ({
  default: { apiUrl: 'https://api.faultmaven.ai', inputLimits: {} },
}));

import {
  PANEL_STORAGE_NAMESPACE,
  WEB_HOST_PAGE_CAPTURE,
  createWebHostCapabilities,
  createWebHostEndpoints,
  createWebHostNavigation,
  createWebHostStore,
} from '../../copilot/webHost';
import { COPILOT_STORE_URL } from '../../copilot/storeListing';

/**
 * The Dashboard's answers to the Copilot UI's host contract (ADR-016 D2).
 *
 * The adapter boundary is the only place a host-specific defect can hide, which
 * is why the ADR requires it to be tested PER HOST rather than once. These are
 * the web host's answers; the extension's are tested in its own repository.
 */

describe('web host store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('namespaces its keys away from the auth storage adapter', async () => {
    const store = createWebHostStore();
    await store.set({ conversationTitles: { 'case-1': 'Disk full' } });

    expect(localStorage.getItem(`${PANEL_STORAGE_NAMESPACE}conversationTitles`)).toBe(
      JSON.stringify({ 'case-1': 'Disk full' }),
    );
    // The Dashboard's own adapter writes `faultmaven_*`. A collision would let
    // the panel's persistence and this app's session overwrite each other.
    expect(PANEL_STORAGE_NAMESPACE.startsWith('faultmaven_')).toBe(false);
    expect(localStorage.getItem('conversationTitles')).toBeNull();
  });

  it('round-trips structured values rather than stringifying them', async () => {
    const store = createWebHostStore();
    await store.set({ pinnedCases: ['a', 'b'], sidebarCollapsed: true, count: 3 });

    expect(await store.get(['pinnedCases', 'sidebarCollapsed', 'count'])).toEqual({
      pinnedCases: ['a', 'b'],
      sidebarCollapsed: true,
      count: 3,
    });
  });

  it('OMITS absent keys instead of returning undefined entries', async () => {
    // `useDataRecovery` distinguishes "no conversations cached" from "an empty
    // cache" by key PRESENCE, and extension `storage.local` behaves this way. A
    // store that returned `{conversations: undefined}` would make the hydrate
    // path think it had a cache.
    const store = createWebHostStore();
    await store.set({ present: 1 });

    const read = await store.get(['present', 'missing']);
    expect(Object.keys(read)).toEqual(['present']);
    expect('missing' in read).toBe(false);
  });

  it('removes keys', async () => {
    const store = createWebHostStore();
    await store.set({ faultmaven_current_case: 'case-9' });
    await store.remove(['faultmaven_current_case']);

    expect(await store.get(['faultmaven_current_case'])).toEqual({});
  });

  it('notifies subscribers when another tab writes a watched key', () => {
    const store = createWebHostStore();
    const onChange = vi.fn();
    const unsubscribe = store.subscribe(['conversations'], onChange);

    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}conversations`, JSON.stringify({ x: [] }));
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: `${PANEL_STORAGE_NAMESPACE}conversations`,
        newValue: JSON.stringify({ x: [] }),
      }),
    );

    expect(onChange).toHaveBeenCalledWith({ conversations: { x: [] } });
    unsubscribe();
  });

  it('ignores keys it was not asked about', () => {
    const store = createWebHostStore();
    const onChange = vi.fn();
    const unsubscribe = store.subscribe(['conversations'], onChange);

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: `${PANEL_STORAGE_NAMESPACE}somethingElse`,
        newValue: '1',
      }),
    );

    expect(onChange).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('treats a whole-store clear in another tab as every watched key going away', () => {
    // `localStorage.clear()` arrives with a null key. Skipping it as "not one of
    // mine" would leave the panel holding state that no longer exists.
    const store = createWebHostStore();
    const onChange = vi.fn();
    const unsubscribe = store.subscribe(['conversations', 'pinnedCases'], onChange);

    window.dispatchEvent(new StorageEvent('storage', { key: null }));

    expect(onChange).toHaveBeenCalledWith({
      conversations: undefined,
      pinnedCases: undefined,
    });
    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const store = createWebHostStore();
    const onChange = vi.fn();
    store.subscribe(['conversations'], onChange)();

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: `${PANEL_STORAGE_NAMESPACE}conversations`,
        newValue: '{}',
      }),
    );

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('web host endpoints', () => {
  it('resolves the SAME-ORIGIN deployment to an absolute origin', async () => {
    // The Kubernetes Dashboard ships `VITE_API_URL=""` and proxies `/api/*`, so
    // `config.apiUrl` is deliberately the empty string. This app's own client
    // builds relative URLs from it and they resolve; the shared UI composes
    // `new URL(`${baseUrl}/api/v1/…`)`, and `new URL('/api/v1/cases')` THROWS.
    //
    // The result was silent: the transcript rendered empty, cases never listed,
    // async turns never polled. Every browser smoke of this branch used an
    // absolute URL, so none of them could have caught it.
    vi.resetModules();
    vi.doMock('../../config', () => ({ default: { apiUrl: '', inputLimits: {} } }));
    const { createWebHostEndpoints: sameOrigin } = await import('../../copilot/webHost');

    const resolved = await sameOrigin().apiUrl();

    expect(resolved).toBe(window.location.origin);
    expect(resolved).not.toBe('');
    // The shape the package actually needs: an absolute base a URL can be built on.
    expect(() => new URL(`${resolved}/api/v1/cases`)).not.toThrow();
    vi.doUnmock('../../config');
    vi.resetModules();
  });

  it('answers with the deployment the Dashboard itself talks to', async () => {
    // Same value `src/config.ts` resolves for every other request this app
    // makes. That is the whole of "both hosts share the case": one origin, one
    // identity, one set of rows.
    const endpoints = createWebHostEndpoints();
    expect(await endpoints.apiUrl()).toBe('https://api.faultmaven.ai');
  });

  it('answers the dashboard URL with the origin that served this page', async () => {
    const endpoints = createWebHostEndpoints();
    expect(await endpoints.dashboardUrl()).toBe(window.location.origin);
  });

  it('implements subscribe as a no-op that still returns an unsubscribe', () => {
    // The endpoint cannot change under a web page, but the calling hook must
    // need no host branch for that — so the method exists and answers.
    const endpoints = createWebHostEndpoints();
    const unsubscribe = endpoints.subscribe(() => {
      throw new Error('a web host endpoint must never change under the panel');
    });
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('web host navigation', () => {
  it('routes in-app rather than opening a tab', async () => {
    const navigate = vi.fn();
    await createWebHostNavigation(navigate).dashboard('/cases/case-1');
    expect(navigate).toHaveBeenCalledWith('/cases/case-1');
  });

  it('offers no `external` — nothing in the shared UI asks for one', () => {
    // It is not in the capability subset the package wires, and no call site
    // exists. An affordance kept working for a caller that does not exist is
    // maintenance, not a feature.
    expect('external' in createWebHostNavigation(vi.fn())).toBe(false);
  });

  it('has NO settings surface — null, not a no-op', () => {
    // `null` removes the affordance; a no-op function would render a dead
    // "Open Settings" button that silently does nothing.
    expect(createWebHostNavigation(vi.fn()).settings).toBeNull();
  });
});

describe('web host page capture', () => {
  it('is unsupported, and says why, with somewhere to go', () => {
    // ADR-016 D2: the affordance stays visible and explains itself. A union arm
    // carrying a reason and an install link is what makes that unmissable —
    // there is no shape in which the panel renders the button and has nothing
    // to say when it is pressed.
    expect(WEB_HOST_PAGE_CAPTURE.supported).toBe(false);
    if (WEB_HOST_PAGE_CAPTURE.supported) throw new Error('unreachable');

    expect(WEB_HOST_PAGE_CAPTURE.reason.length).toBeGreaterThan(20);
    expect(WEB_HOST_PAGE_CAPTURE.installUrl).toBe(COPILOT_STORE_URL);
  });
});

describe('web host capabilities', () => {
  it('supplies every member the shared UI wires, and no session', () => {
    const capabilities = createWebHostCapabilities(vi.fn());

    expect(Object.keys(capabilities).sort()).toEqual([
      'endpoints',
      'navigation',
      'pageCapture',
      'store',
    ]);
    // Capabilities are known before anyone signs in; a session is not. The
    // split is what makes "the panel renders no sign-in" a property of the type
    // rather than a branch somebody remembers.
    expect('session' in capabilities).toBe(false);
  });
});
