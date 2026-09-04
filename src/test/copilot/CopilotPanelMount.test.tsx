import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { WiredHost } from '@faultmaven/copilot-ui';

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
let lastHost: WiredHost | null = null;

vi.mock('@faultmaven/copilot-ui', () => ({
  setHostStore,
  setHostEndpoints,
  setApiTransport,
  CopilotPanel: ({ host }: { host: WiredHost }) => {
    lastHost = host;
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
import {
  PANEL_AVAILABLE_MESSAGE_TYPE,
  resetPanelAnnouncementForTests,
} from '../../copilot/advertisement';

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

function mount(caseId: string | null) {
  return render(
    <MemoryRouter>
      <CopilotPanelMount caseId={caseId} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  lastHost = null;
  resetPanelAnnouncementForTests();
  getAccountProfile.mockResolvedValue(PROFILE);
  getAccessToken.mockResolvedValue('tok-live');
});

describe('CopilotPanelMount', () => {
  it('installs the module singletons before the panel renders', async () => {
    mount(null);
    await screen.findByTestId('shared-copilot-ui');

    // Reads before installation THROW by design: a request that silently went
    // out unauthenticated, or to the wrong origin, is the failure the boundary
    // exists to prevent.
    expect(setHostStore).toHaveBeenCalledTimes(1);
    expect(setHostEndpoints).toHaveBeenCalledTimes(1);
    expect(setApiTransport).toHaveBeenCalledTimes(1);
  });

  it('gives the panel a host whose session is the Dashboard’s own', async () => {
    mount(null);
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
    mount(null);
    await screen.findByTestId('shared-copilot-ui');

    const transport = setApiTransport.mock.calls[0][0];
    await expect(transport.baseUrl()).resolves.toBe('https://api.faultmaven.ai');
    await expect(transport.accessToken()).resolves.toBe('tok-live');
  });

  it('reads and clears the FaultMaven session id through the host store', async () => {
    mount(null);
    await screen.findByTestId('shared-copilot-ui');
    const transport = setApiTransport.mock.calls[0][0];

    await expect(transport.sessionId()).resolves.toBeNull();

    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}sessionId`, JSON.stringify('sess-1'));
    await expect(transport.sessionId()).resolves.toBe('sess-1');

    await transport.clearSession();
    expect(localStorage.getItem(`${PANEL_STORAGE_NAMESPACE}sessionId`)).toBeNull();
  });

  it('asserts the environment is ready, so the panel probes backend capabilities', async () => {
    // The panel gates its capability probe on a first-run flag the extension
    // sets from its onboarding screen. This host has no onboarding, and without
    // the flag the panel renders with `capabilities: null` and never asks the
    // backend what it supports.
    mount(null);
    await screen.findByTestId('shared-copilot-ui');

    expect(localStorage.getItem(`${PANEL_STORAGE_NAMESPACE}hasCompletedFirstRun`)).toBe('true');
  });

  it('seeds the active-case pointer when opened on a case', async () => {
    mount('case-42');
    await screen.findByTestId('shared-copilot-ui');

    expect(localStorage.getItem(`${PANEL_STORAGE_NAMESPACE}faultmaven_current_case`)).toBe(
      JSON.stringify('case-42'),
    );
  });

  it('clears the pointer for a new investigation, so no earlier case reopens', async () => {
    localStorage.setItem(
      `${PANEL_STORAGE_NAMESPACE}faultmaven_current_case`,
      JSON.stringify('case-old'),
    );

    mount(null);
    await screen.findByTestId('shared-copilot-ui');

    expect(localStorage.getItem(`${PANEL_STORAGE_NAMESPACE}faultmaven_current_case`)).toBeNull();
  });

  it('advertises the panel to the extension once it has mounted', async () => {
    // The other half of the ADR-016 D4 contract; the attribute in the initial
    // HTML is checked in indexHtmlAdvertisement.test.ts.
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    mount(null);
    await screen.findByTestId('shared-copilot-ui');

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        { type: PANEL_AVAILABLE_MESSAGE_TYPE },
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

    mount(null);
    await screen.findByTestId('copilot-panel-error');

    expect(postMessage).not.toHaveBeenCalled();
    postMessage.mockRestore();
  });
});
