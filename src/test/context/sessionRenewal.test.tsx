import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { CLOUD_AUTH_CONFIG, OTHER_AUTH_STATE, STANDALONE_AUTH_CONFIG, TEST_AUTH_STATE } from '../support/authFixtures';

/**
 * A reload while the access token is expired and `/auth/refresh` fails
 * transiently (faultmaven#2999): the REAL AuthManager over this app's storage
 * adapter, the REAL AuthContext and guards, and `fetch` as the backend.
 *
 * The session is kept, so the user is not signed out: the guards show a retry
 * card, never `/login`, and the stored session is used once a renewal succeeds.
 * Each test loads its own module graph, so its AuthManager starts unread, as a
 * reloaded tab's does.
 */

vi.mock('../../config', () => ({
  default: { apiUrl: 'https://api.faultmaven.ai', inputLimits: {} },
}));

const RENEWAL_COPY =
  'We could not renew your session just now. You are still signed in, and nothing is wrong with your account. We will keep trying; you can also try again now.';

const backend = {
  refreshStatus: 503,
  refreshCalls: 0,
  /** When set, `/auth/refresh` waits on it before answering. */
  refreshGate: null as Promise<void> | null,
  authConfig: STANDALONE_AUTH_CONFIG as object,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  backend.refreshStatus = 503;
  backend.refreshCalls = 0;
  backend.refreshGate = null;
  backend.authConfig = STANDALONE_AUTH_CONFIG;
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname === '/api/v1/auth/refresh') {
        backend.refreshCalls++;
        if (backend.refreshGate) await backend.refreshGate;
        if (backend.refreshStatus !== 200) return new Response(null, { status: backend.refreshStatus });
        return json({ access_token: 'tok-renewed', refresh_token: 'refresh-2', expires_in: 3600 });
      }
      if (url.pathname === '/api/v1/auth/config') return json(backend.authConfig);
      if (url.pathname.endsWith('/capabilities')) return json({ features: {} });
      return json({});
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A reloaded tab: `ada`'s session stored with an expired access token, then the app mounted at `path`. */
async function reloadAt(path: string, stored: Partial<typeof TEST_AUTH_STATE> = {}) {
  vi.resetModules();
  await import('../../lib/storage');
  await window.browser!.storage.local.set({
    authState: { ...TEST_AUTH_STATE, expires_at: Date.now() - 60_000, ...stored },
  });
  const { authManager } = await import('../../lib/auth/AuthManager');
  const { AuthProvider, useAuth, CONFIG_REPROBE_INTERVAL_MS } = await import('../../context/AuthContext');
  const { ProtectedRoute } = await import('../../components/ProtectedRoute');
  const { GatedRoute } = await import('../../components/GatedRoute');
  const { default: SignUpPage } = await import('../../pages/SignUpPage');

  function Page() {
    return <div>page for {useAuth().authState?.user.username}</div>;
  }
  /** This tab signing someone in, from outside the guarded routes. */
  function SignInAsGrace() {
    const { setAuthState } = useAuth();
    return <button onClick={() => void setAuthState(OTHER_AUTH_STATE)}>sign in as grace</button>;
  }

  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <SignInAsGrace />
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/cases" element={<ProtectedRoute><Page /></ProtectedRoute>} />
          <Route path="/gated" element={<GatedRoute allow={() => true}><Page /></GatedRoute>} />
          <Route path="/signup" element={<SignUpPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
  return { authManager, CONFIG_REPROBE_INTERVAL_MS };
}

/** The renewal card, in full, with no link to `/cases` and no redirect to `/login`. */
async function expectRenewalCard() {
  expect(await screen.findByRole('heading', { name: "Can't reach FaultMaven" })).toBeInTheDocument();
  expect(screen.getByText(RENEWAL_COPY)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.queryByText('Back to cases')).not.toBeInTheDocument();
  expect(screen.queryByText('login page')).not.toBeInTheDocument();
}

describe('a reload while the session cannot be renewed (faultmaven#2999)', () => {
  it.each(['/cases', '/gated'])(
    'at %s shows the renewal card, not sign-in, and uses the stored session once a retry renews it',
    async (path) => {
      await reloadAt(path);

      await expectRenewalCard();
      expect(backend.refreshCalls).toBeGreaterThan(0);

      backend.refreshStatus = 200;
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('page for ada')).toBeInTheDocument();
      expect(screen.queryByText('login page')).not.toBeInTheDocument();
    },
  );

  // ProtectedRoute is the guard that records one; nothing is leaving here.
  it('records no return path at /cases while the card stands', async () => {
    await reloadAt('/cases');
    await expectRenewalCard();

    expect(sessionStorage.getItem('oauth_redirect_after_login')).toBeNull();
  });

  // Unreadable storage leaves a session unrenewed too, so the card blames no API.
  it('keeps the card, and its attempt count, through a failed Try again, naming the session and not the API', async () => {
    await reloadAt('/cases');
    await expectRenewalCard();
    expect(screen.queryByText(/Check that the API is running/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Still could not renew your session (1 attempt).')).toBeInTheDocument();
    await expectRenewalCard();
  });

  it('offers a deliberate sign-out that ends at sign-in and records no return path', async () => {
    await reloadAt('/cases');
    await expectRenewalCard();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(sessionStorage.getItem('oauth_redirect_after_login')).toBeNull();
  });

  it('at /signup shows the renewal card even when the config answers before the session load', async () => {
    let release: () => void = () => {};
    backend.refreshGate = new Promise((resolve) => {
      release = resolve;
    });
    await reloadAt('/signup');
    // The standalone config lands while the refresh is still held.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    release();

    await expectRenewalCard();
  });

  // Sign out clears the session and THEN navigates to the IdP's logout; a
  // sign-up hand-off on the cleared state would override it, and the IdP
  // session would survive.
  it('at /signup lets Sign out reach the IdP logout, handing nothing off to sign-up', async () => {
    backend.authConfig = CLOUD_AUTH_CONFIG;
    const navigations: string[] = [];
    vi.spyOn(window.location, 'assign').mockImplementation((url) => void navigations.push(`assign ${url}`));
    vi.spyOn(window.location, 'replace').mockImplementation((url) => void navigations.push(`replace ${url}`));
    await reloadAt('/signup', { idp_logout_url: 'https://idp.example/logout' });
    await expectRenewalCard();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(navigations).toContain('assign https://idp.example/logout'));
    expect(navigations.filter((n) => n.startsWith('replace'))).toEqual([]);
  });

  it('loads at once when another tab writes this user’s renewed session', async () => {
    const { AUTH_STATE_STORAGE_KEY } = await import('../../lib/auth/crossTab');
    await reloadAt('/cases');
    await expectRenewalCard();

    // Another tab renewed it: a fresh row for the same user, and its signal.
    await window.browser!.storage.local.set({ authState: { ...TEST_AUTH_STATE, access_token: 'tok-other-tab' } });
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: AUTH_STATE_STORAGE_KEY, newValue: localStorage.getItem(AUTH_STATE_STORAGE_KEY) }),
      );
    });

    expect(await screen.findByText('page for ada')).toBeInTheDocument();
  });

  it('retries quietly at the reprobe cadence, and stops once the session is renewed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { authManager, CONFIG_REPROBE_INTERVAL_MS } = await reloadAt('/cases');
    await expectRenewalCard();
    const loads = vi.spyOn(authManager, 'loadSession');

    backend.refreshStatus = 200;
    act(() => {
      vi.advanceTimersByTime(CONFIG_REPROBE_INTERVAL_MS);
    });

    expect(await screen.findByText('page for ada')).toBeInTheDocument();
    expect(loads).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(3 * CONFIG_REPROBE_INTERVAL_MS);
    });
    expect(loads).toHaveBeenCalledTimes(1);
  });

  it('routes to sign-in when a retry finds the credential rejected', async () => {
    await reloadAt('/cases');
    await expectRenewalCard();

    backend.refreshStatus = 401;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('routes a sign-out in another tab to sign-in, recording no return path', async () => {
    const { AUTH_STATE_STORAGE_KEY } = await import('../../lib/auth/crossTab');
    await reloadAt('/cases');
    await expectRenewalCard();

    localStorage.removeItem(AUTH_STATE_STORAGE_KEY);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STATE_STORAGE_KEY, newValue: null }));
    });

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(sessionStorage.getItem('oauth_redirect_after_login')).toBeNull();
  });

  it('lets a retry that ends after a newer sign-in write nothing over it', async () => {
    const { authManager } = await reloadAt('/cases');
    await expectRenewalCard();
    let release: () => void = () => {};
    backend.refreshGate = new Promise((resolve) => {
      release = resolve;
    });
    const loads = vi.spyOn(authManager, 'loadSession');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(loads).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'sign in as grace' }));
    expect(await screen.findByText('page for grace')).toBeInTheDocument();

    // The stale retry now fails, and would answer `signedOut` for ada's session.
    await act(async () => {
      release();
      await loads.mock.results[0].value;
    });

    expect(screen.getByText('page for grace')).toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });
});
