import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// The app's `window.browser.storage`, over `localStorage`, as `main.tsx` installs it.
import '../../lib/storage';
import { PANEL_STORAGE_NAMESPACE } from '../../copilot/webHost';
import { TEST_AUTH_STATE, TEST_PROFILE } from '../support/authFixtures';

/**
 * A refresh outage, end to end (faultmaven#1460): the REAL `AuthManager` over
 * this app's storage adapter, the REAL package through this host's mount, and
 * `fetch` as the backend.
 *
 * Neither half alone shows it. With an expired access token and
 * `/auth/refresh` failing transiently, AuthManager keeps the session and has
 * no token to give; how the host says so decides whether the panel sends the
 * request with no bearer, and reads the server's 401 as "Sign in first",
 * inside a signed-in Dashboard. The mocked-AuthManager suites cannot see the
 * keep, and the mocked-package suites cannot see the send.
 *
 * Each test loads its own module graph, so the mount and the test share one
 * AuthManager. The fixture has no `idp_logout_url`, so a cleared session never
 * navigates.
 */

vi.mock('../../config', () => ({
  default: { apiUrl: 'https://api.faultmaven.ai', inputLimits: {} },
}));
vi.mock('../../lib/auth/functions', async () => ({
  getAccountProfile: vi.fn().mockResolvedValue((await import('../support/authFixtures')).TEST_PROFILE),
}));

type SentRequest = { path: string; bearer: string | null };
const sent: SentRequest[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The backend: `/auth/refresh` answers `refreshStatus`, and no bearer gets a 401, as the server does. */
function backend(refreshStatus: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const bearer = new Headers(init?.headers).get('Authorization');
      sent.push({ path: url.pathname, bearer });
      if (url.pathname === '/api/v1/auth/refresh') return new Response(null, { status: refreshStatus });
      if (url.pathname.endsWith('/capabilities')) return json({ features: {} });
      if (!bearer) return json({ detail: 'Not authenticated' }, 401);
      return json({});
    }),
  );
}

/** A fresh module graph whose AuthManager holds `u1`'s session with an expired access token. */
async function signedInWithExpiredToken() {
  vi.resetModules();
  const { authManager } = await import('../../lib/auth/AuthManager');
  await authManager.saveAuthState({ ...TEST_AUTH_STATE, expires_at: Date.now() - 60_000 });
  const ui = await import('@faultmaven/copilot-ui');
  const { createWebSession, hostUserFromProfile } = await import('../../copilot/webSession');
  const session = createWebSession(hostUserFromProfile(TEST_PROFILE), {
    SessionSwitched: ui.SessionSwitchedError,
    CredentialUnavailable: ui.CredentialUnavailableError,
  });
  return { authManager, ui, session };
}

/** This host's mount, in the same module graph; resolves once the composer is there. */
async function mountPanel() {
  const { default: CopilotPanelMount } = await import('../../copilot/CopilotPanelMount');
  const { container } = render(
    <MemoryRouter>
      <CopilotPanelMount initialCase={{ kind: 'new' }} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(container.querySelector('textarea')).not.toBeNull());
  return container;
}

beforeEach(() => {
  sent.length = 0;
  localStorage.clear();
  localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}hasCompletedFirstRun`, 'true');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  Element.prototype.scrollIntoView ??= () => {};
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a refresh outage, through the real AuthManager and the real panel', () => {
  it('shows the connection copy, never a sign-in, and sends nothing without a bearer', async () => {
    backend(503);
    const { authManager } = await signedInWithExpiredToken();
    const container = await mountPanel();

    await userEvent.type(container.querySelector('textarea') as HTMLTextAreaElement, 'why is checkout slow{Enter}');

    // Once the client's own retries (1 s, then 2 s) are spent.
    await waitFor(() => expect(document.body.textContent).toMatch(/Unable to reach FaultMaven server.*Send again to retry/), {
      timeout: 10_000,
    });
    expect(document.body.textContent).not.toMatch(/sign in|session has expired/i);
    expect(sent.filter((r) => r.path.startsWith('/api/v1/cases') && !r.bearer)).toEqual([]);
    // The outage is what ran: renewals were tried, and the session is still held.
    expect(sent.some((r) => r.path === '/api/v1/auth/refresh')).toBe(true);
    expect(await authManager.holdsSessionFor('u1')).toBe(true);
  }, 15_000);

  it('an upload with no session yet shows the connection copy too, never the sign-in advice', async () => {
    // The upload ensures a session first. The package reads a mint refused
    // for want of a bearer as signed out ("Sign in first"); that is right only
    // because this host refuses it as `CredentialUnavailableError` while the
    // session is kept.
    backend(503);
    await signedInWithExpiredToken();
    const container = await mountPanel();

    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['ERROR db timeout'], 'app.log', { type: 'text/plain' }),
    );
    await userEvent.type(container.querySelector('textarea') as HTMLTextAreaElement, 'what failed{Enter}');

    await waitFor(() => expect(document.body.textContent).toMatch(/Unable to reach FaultMaven server.*Send again to retry/));
    expect(document.body.textContent).not.toMatch(/sign in|signed out|session has expired/i);
    expect(sent.filter((r) => r.path.startsWith('/api/v1/') && r.path !== '/api/v1/auth/refresh' && !r.bearer && !r.path.endsWith('/capabilities'))).toEqual([]);
  });

  it('a refresh the server rejects ends the session, and only then is the throw the plain Error', async () => {
    backend(401);
    const { authManager, ui, session } = await signedInWithExpiredToken();

    const attempt = session.accessToken();
    await expect(attempt).rejects.toThrow(/no faultmaven session/i);
    await expect(attempt).rejects.not.toBeInstanceOf(ui.CredentialUnavailableError);
    expect(await authManager.holdsSessionFor('u1')).toBe(false);
  });

  it('a storage read that fails settles nothing: CredentialUnavailableError, and no refresh is sent', async () => {
    backend(503);
    const { ui, session } = await signedInWithExpiredToken();
    const local = (window as unknown as { browser: { storage: { local: { get: () => Promise<unknown> } } } }).browser.storage.local;
    vi.spyOn(local, 'get').mockRejectedValue(new Error('storage hiccup'));

    await expect(session.accessToken()).rejects.toBeInstanceOf(ui.CredentialUnavailableError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
