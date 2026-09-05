import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// NO mock of '@faultmaven/copilot-ui'. The purge under test is the package's.
import { clearApiTransport, clearHostEndpoints, clearHostStore } from '@faultmaven/copilot-ui';
import CopilotPanelMount from '../../copilot/CopilotPanelMount';
import { PANEL_STORAGE_NAMESPACE } from '../../copilot/webHost';
import { resetPageSingletonsForTests } from '../../copilot/pageSingletons';

/**
 * Sign-out and unmount, at the same instant, through the real mount.
 *
 * This is the shape the shell actually produces: signing out ends the session
 * AND takes the route away, so the panel is told the session is over and
 * unmounted in the same tick. The panel's reaction is a fire-and-forget purge
 * across four store-backed steps.
 *
 * MOUNTED THROUGH `CopilotPanelMount`, deliberately. An earlier version of this
 * test rendered `CopilotPanel` directly with a hand-built host — which meant no
 * cleanup effect ran on unmount, so it passed against the very ordering it was
 * written to catch. The cleanup is the subject; it has to be in the tree.
 */

const onAuthClearedListeners: Array<() => void> = [];

vi.mock('../../lib/auth/AuthManager', () => ({
  authManager: {
    getAccessToken: vi.fn().mockResolvedValue('tok-live'),
    peekAccessToken: vi.fn().mockResolvedValue('tok-live'),
    refreshTokens: vi.fn().mockResolvedValue('tok-live'),
    onAuthCleared: (listener: () => void) => {
      onAuthClearedListeners.push(listener);
      return () => {
        const i = onAuthClearedListeners.indexOf(listener);
        if (i >= 0) onAuthClearedListeners.splice(i, 1);
      };
    },
  },
}));

vi.mock('../../lib/auth/functions', async () => ({
  getAccountProfile: vi
    .fn()
    .mockResolvedValue((await import('../support/authFixtures')).TEST_PROFILE),
}));

vi.mock('../../config', () => ({
  default: { apiUrl: 'https://api.faultmaven.ai', inputLimits: {} },
}));

const consoleLines: string[] = [];

function stubBackend() {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/capabilities')) return json({ features: {} });
    if (url.includes('/sessions')) return json({ session_id: 'sess-1' });
    if (url.includes('/cases')) return json({ cases: [], total_count: 0 });
    return json({});
  });
}

function panelKeys(): string[] {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(PANEL_STORAGE_NAMESPACE))
    .map((k) => k.slice(PANEL_STORAGE_NAMESPACE.length))
    // A boolean about onboarding, owned by the browser rather than the session.
    .filter((k) => k !== 'hasCompletedFirstRun')
    .sort();
}

beforeEach(() => {
  onAuthClearedListeners.length = 0;
  consoleLines.length = 0;
  localStorage.clear();
  resetPageSingletonsForTests();
  clearApiTransport();
  clearHostEndpoints();
  clearHostStore();
  for (const level of ['warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleLines.push(args.map(String).join(' '));
    });
  }
  vi.stubGlobal('fetch', stubBackend());
  Element.prototype.scrollIntoView ??= () => {};
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountPanel() {
  const result = render(
    <MemoryRouter>
      <CopilotPanelMount initialCase={{ kind: 'new' }} />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.queryByTestId('copilot-panel-loading')).toBeNull();
  });
  await waitFor(() => expect(onAuthClearedListeners.length).toBeGreaterThan(0));
  return result;
}

describe('signing out while the shell unmounts the panel', () => {
  it('purges every fm.copilot.* key, with the store still installed', async () => {
    const { unmount } = await mountPanel();

    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}conversations`, JSON.stringify({ c: [] }));
    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}pinnedCases`, JSON.stringify(['c']));
    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}faultmaven_current_case`, JSON.stringify('c'));
    expect(panelKeys().length).toBeGreaterThan(0);

    // Both, in the order the shell produces them.
    await act(async () => {
      for (const listener of [...onAuthClearedListeners]) listener();
      unmount();
    });

    await waitFor(() => {
      expect(panelKeys()).toEqual([]);
    });
  });

  it('never reports a missing host store', async () => {
    // The symptom of the old ordering: four `No HostStore installed` throws as
    // each purge step reached for a store the unmount had already removed.
    const { unmount } = await mountPanel();
    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}conversations`, JSON.stringify({ c: [] }));

    await act(async () => {
      for (const listener of [...onAuthClearedListeners]) listener();
      unmount();
    });

    await waitFor(() => expect(panelKeys()).toEqual([]));
    expect(consoleLines.filter((l) => /No HostStore installed/.test(l))).toEqual([]);
  });
});
