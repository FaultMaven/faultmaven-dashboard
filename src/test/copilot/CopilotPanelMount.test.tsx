import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { InitialCase, WiredHost } from '@faultmaven/copilot-ui';

/**
 * What the host installs before the shared UI renders (ADR-016 D2, D4).
 *
 * The package is mocked, not rendered. What is under test is the WIRING — the
 * module singletons, the transport, the session, the seeding and the
 * advertisement — and mounting 12K lines of shared UI to inspect it would test
 * the package instead of the boundary. The package's own repository renders it.
 */

const setHostStore = vi.fn();
const setHostEndpoints = vi.fn();
const setApiTransport = vi.fn();
const clearPersistedSession = vi.fn().mockResolvedValue(undefined);
const clearApiTransport = vi.fn();
const clearHostEndpoints = vi.fn();
const clearHostStore = vi.fn();
let lastHost: WiredHost | null = null;
let lastInitialCase: InitialCase | undefined;

vi.mock('@faultmaven/copilot-ui', () => ({
  setHostStore,
  setHostEndpoints,
  setApiTransport,
  clearPersistedSession,
  clearApiTransport,
  clearHostEndpoints,
  clearHostStore,
  CopilotPanel: ({ host, initialCase }: { host: WiredHost; initialCase?: InitialCase }) => {
    lastHost = host;
    lastInitialCase = initialCase;
    return <div data-testid="shared-copilot-ui">shared UI</div>;
  },
}));

const getAccountProfile = vi.fn();
vi.mock('../../lib/auth/functions', () => ({
  getAccountProfile: (...args: unknown[]) => getAccountProfile(...args),
}));

const getAccessToken = vi.fn();
vi.mock('../../lib/auth/AuthManager', () => ({
  authManager: {
    getAccessToken: (...args: unknown[]) => getAccessToken(...args),
    peekAccessToken: vi.fn().mockResolvedValue(null),
    refreshTokens: vi.fn(),
    onAuthCleared: vi.fn().mockReturnValue(() => {}),
  },
}));

vi.mock('../../config', () => ({
  default: { apiUrl: 'https://api.faultmaven.ai', inputLimits: {} },
}));

import CopilotPanelMount from '../../copilot/CopilotPanelMount';
import { PANEL_STORAGE_NAMESPACE } from '../../copilot/webHost';
import { DASHBOARD_PANEL_MESSAGE } from '../../copilot/advertisement';

const PROFILE = {
  user_id: 'u1',
  username: 'ada',
  display_name: 'Ada L',
  email: 'ada@example.com',
  roles: ['user'],
  is_dev_user: false,
  created_at: '2026-01-01T00:00:00Z',
  organization: { organization_id: 'org-1', name: 'Acme' },
};

function mount(initialCase: InitialCase) {
  return render(
    <MemoryRouter>
      <CopilotPanelMount initialCase={initialCase} />
    </MemoryRouter>,
  );
}

const NEW_INVESTIGATION: InitialCase = { kind: 'new' };

/** Namespaced keys this host has written to the viewer's storage. */
function hostWrittenKeys(): string[] {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(PANEL_STORAGE_NAMESPACE))
    .map((key) => key.slice(PANEL_STORAGE_NAMESPACE.length))
    .sort();
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  lastHost = null;
  lastInitialCase = undefined;
  getAccountProfile.mockResolvedValue(PROFILE);
  getAccessToken.mockResolvedValue('tok-live');
});

describe('CopilotPanelMount', () => {
  it('installs the module singletons before the panel renders', async () => {
    mount(NEW_INVESTIGATION);
    await screen.findByTestId('shared-copilot-ui');

    // Reads before installation THROW by design: a request that silently went
    // out unauthenticated, or to the wrong origin, is the failure the boundary
    // exists to prevent.
    expect(setHostStore).toHaveBeenCalledTimes(1);
    expect(setHostEndpoints).toHaveBeenCalledTimes(1);
    expect(setApiTransport).toHaveBeenCalledTimes(1);
  });

  it('gives the panel a host whose session is the Dashboard’s own', async () => {
    mount(NEW_INVESTIGATION);
    await screen.findByTestId('shared-copilot-ui');

    expect(lastHost).not.toBeNull();
    const host = lastHost as unknown as WiredHost;
    expect(host.session.user).toEqual({
      id: 'u1',
      username: 'ada',
      displayName: 'Ada L',
      email: 'ada@example.com',
      roles: ['user'],
      organizationId: 'org-1',
    });
    // The two properties ADR-016 D3 rests on, asserted at the mount rather than
    // only in the session's own suite: there is no host value without a session,
    // and the panel is given no sign-out of its own.
    expect(host.session.signOut).toBeNull();
    await expect(host.session.accessToken()).resolves.toBe('tok-live');
  });

  it('points the transport at the same backend and bearer the rest of the app uses', async () => {
    // This is the whole of "both hosts share the session, the case and the
    // transcript": one origin, one identity, one set of server-side rows. There
    // is nothing else for the two hosts to agree about.
    mount(NEW_INVESTIGATION);
    await screen.findByTestId('shared-copilot-ui');

    const transport = setApiTransport.mock.calls[0][0];
    await expect(transport.baseUrl()).resolves.toBe('https://api.faultmaven.ai');
    await expect(transport.accessToken()).resolves.toBe('tok-live');
  });

  it('reads and clears the FaultMaven session id through the host store', async () => {
    mount(NEW_INVESTIGATION);
    await screen.findByTestId('shared-copilot-ui');
    const transport = setApiTransport.mock.calls[0][0];

    await expect(transport.sessionId()).resolves.toBeNull();

    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}sessionId`, JSON.stringify('sess-1'));
    await expect(transport.sessionId()).resolves.toBe('sess-1');

    // Delegated to the package's own single writer of those keys rather than
    // restating the list — a fourth copy of it had already drifted over whether
    // `clientId` survives a session ending.
    await transport.clearSession();
    expect(clearPersistedSession).toHaveBeenCalledTimes(1);
  });

  it('writes NO onboarding flag — embedded chrome owns that now', async () => {
    // The host used to poke `hasCompletedFirstRun` into the panel's own storage
    // to get past an onboarding gate meant for the extension. The package skips
    // that gate for `chrome: 'embedded'`, so the host writes nothing at all.
    mount(NEW_INVESTIGATION);
    await screen.findByTestId('shared-copilot-ui');

    expect(localStorage.getItem(`${PANEL_STORAGE_NAMESPACE}hasCompletedFirstRun`)).toBeNull();
    expect(hostWrittenKeys()).toEqual([]);
  });

  it('tells the panel what to open, as an argument', async () => {
    mount({ kind: 'existing', caseId: 'case-42' });
    await screen.findByTestId('shared-copilot-ui');

    expect(lastInitialCase).toEqual({ kind: 'existing', caseId: 'case-42' });
  });

  it('opens a new investigation as an argument too', async () => {
    mount(NEW_INVESTIGATION);
    await screen.findByTestId('shared-copilot-ui');

    expect(lastInitialCase).toEqual({ kind: 'new' });
  });

  it('writes NO storage to open a case', async () => {
    // The property that replaced the seeding. This host briefly expressed
    // "open on this case" by writing the panel's own active-case pointer into
    // storage before mounting it — which worked, and coupled this file to a key
    // name, an encoding and a race with the panel's hydrate that neither side
    // could see. The intent is an argument now, so the only key the host has
    // any business writing is its assertion that the environment is ready.
    mount({ kind: 'existing', caseId: 'case-42' });
    await screen.findByTestId('shared-copilot-ui');

    expect(hostWrittenKeys()).toEqual([]);
  });

  it('leaves the panel\u2019s own persisted pointer alone', async () => {
    // Nor does it DELETE one. Whatever the panel last persisted is the panel's;
    // `initialCase` wins over the restore inside the package, so a host that
    // reached in to clear it would be fighting a race it has already won.
    localStorage.setItem(
      `${PANEL_STORAGE_NAMESPACE}faultmaven_current_case`,
      JSON.stringify('case-old'),
    );

    mount(NEW_INVESTIGATION);
    await screen.findByTestId('shared-copilot-ui');

    expect(localStorage.getItem(`${PANEL_STORAGE_NAMESPACE}faultmaven_current_case`)).toBe(
      JSON.stringify('case-old'),
    );
  });

  it('clears ONLY the transport when it unmounts', async () => {
    // The transport closes over this mount's credential, so a later mount must
    // not inherit it. The store and the endpoints describe the PAGE — its
    // localStorage and its build config — and are never cleared: the shell
    // unmounts the panel on sign-out while the package's purge of that user's
    // data is still running, and pulling the store out from under it made every
    // step throw and left the residue behind.
    const { unmount } = mount(NEW_INVESTIGATION);
    await screen.findByTestId('shared-copilot-ui');

    unmount();

    await waitFor(() => {
      expect(clearApiTransport).toHaveBeenCalledTimes(1);
    });
    expect(clearHostEndpoints).not.toHaveBeenCalled();
    expect(clearHostStore).not.toHaveBeenCalled();
  });

  it('advertises the panel to the extension once it has mounted', async () => {
    // The other half of the ADR-016 D4 contract; the attribute in the initial
    // HTML is checked in indexHtmlAdvertisement.test.ts.
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    mount(NEW_INVESTIGATION);
    await screen.findByTestId('shared-copilot-ui');

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        { type: DASHBOARD_PANEL_MESSAGE },
        window.location.origin,
      );
    });
    postMessage.mockRestore();
  });

  it('does NOT advertise when the panel could not start', async () => {
    // Silence means "the extension keeps its panel", which is the right answer
    // when this one is not there. Announcing anyway would leave the user with
    // neither.
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    getAccountProfile.mockRejectedValue(new Error('profile fetch failed: 500'));

    mount(NEW_INVESTIGATION);
    await screen.findByTestId('copilot-panel-error');

    expect(postMessage).not.toHaveBeenCalled();
    postMessage.mockRestore();
  });
});
