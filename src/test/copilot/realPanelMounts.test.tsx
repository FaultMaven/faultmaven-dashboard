import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// NO `vi.mock('@faultmaven/copilot-ui')`. That is the entire point of this file.
import CopilotPanel, {
  setApiTransport,
  setHostEndpoints,
  setHostStore,
  clearApiTransport,
  clearHostEndpoints,
  clearHostStore,
  type WiredHost,
} from '@faultmaven/copilot-ui';
import { MemoryRouter } from 'react-router-dom';
import { PANEL_STORAGE_NAMESPACE, createWebHostCapabilities } from '../../copilot/webHost';
import { resetPageSingletonsForTests } from '../../copilot/pageSingletons';
import type { WebSession } from '../../copilot/webSession';

// For the mint tests below, which mount through `CopilotPanelMount`: the host
// session it builds is real, and only what that session reads is stubbed, the
// credential store and the `/auth/me` profile.
const auth = vi.hoisted(() => ({
  getAccessTokenFor: vi.fn(),
  peekAccessToken: vi.fn(),
  refreshTokens: vi.fn(),
  onAuthCleared: vi.fn(),
  isSigningOut: vi.fn(),
  holdsSessionFor: vi.fn(),
}));
vi.mock('../../lib/auth/AuthManager', () => ({ authManager: auth }));
vi.mock('../../lib/auth/functions', async () => ({
  getAccountProfile: vi.fn().mockResolvedValue((await import('../support/authFixtures')).TEST_PROFILE),
}));

/** Every session the real mount builds, unchanged but for a spy on `onUnauthorized`. */
const builtSessions = vi.hoisted((): WebSession[] => []);
vi.mock('../../copilot/webSession', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../copilot/webSession')>();
  return {
    ...real,
    createWebSession: (...args: Parameters<typeof real.createWebSession>) => {
      const session = real.createWebSession(...args);
      vi.spyOn(session, 'onUnauthorized');
      builtSessions.push(session);
      return session;
    },
  };
});

/**
 * The REAL panel, mounted once, against this repository's own host adapter.
 *
 * Every other test in this directory mocks `@faultmaven/copilot-ui`, which is
 * right for asserting the wiring — but it means the whole suite was green while
 * the panel crashed on every mount in a browser with
 * "No QueryClient set, use QueryClientProvider": the package needs TanStack
 * Query and nothing installed a provider. A mocked package cannot have that
 * class of defect, because a mocked package has no dependencies.
 *
 * So this test asserts the one thing mocks structurally cannot: that the
 * PACKAGE AT THE PINNED SHA and THIS HOST fit together well enough to render.
 * It is a smoke test on purpose — it does not check what the panel shows, only
 * that mounting it produces the panel rather than an error boundary — because
 * anything finer belongs in the package's own repository, and this one has to
 * keep passing across package revisions that change the UI.
 *
 * The backend is stubbed at `fetch`. The panel mints a session, asks for
 * capabilities and lists cases before it can show anything, so a mount with no
 * backend would fail for reasons that have nothing to do with the boundary
 * under test.
 */

/** Error-boundary fallbacks the panel renders when its subtree throws. */
const BOUNDARY_FALLBACKS = [/nav error/i, /chat error/i, /something went wrong/i];

const consoleErrors: unknown[][] = [];

type SentRequest = { path: string; method: string; headers: Headers };

const isMint = (r: SentRequest) => r.method === 'POST' && r.path === '/api/v1/sessions';
const isHeartbeat = (r: SentRequest) => r.method === 'POST' && r.path.endsWith('/heartbeat');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * The backend, recording each request into `sent`; `answer` goes first, and
 * whatever it leaves goes to the defaults. The mint answers a session for the
 * host's user, `u1`: the panel keeps only a session minted for its own user.
 */
function stubBackend(sent: SentRequest[] = [], answer: (r: SentRequest) => Response | undefined = () => undefined) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const request = { path: url.pathname, method: init?.method ?? 'GET', headers: new Headers(init?.headers) };
    sent.push(request);
    const answered = answer(request);
    if (answered) return answered;
    if (url.pathname.endsWith('/capabilities')) {
      return json({ features: {}, dashboardUrl: 'http://localhost:3333' });
    }
    if (isMint(request)) return json({ session_id: 'sess-1', user_id: 'u1', created_at: new Date().toISOString() });
    if (url.pathname.startsWith('/api/v1/cases')) return json({ cases: [], total_count: 0 });
    if (/\/(knowledge|documents)/.test(url.pathname)) return json({ documents: [], total_count: 0 });
    return json({});
  });
}

function stubHost(): WiredHost {
  const capabilities = createWebHostCapabilities(() => {});
  return {
    ...capabilities,
    session: {
      user: {
        id: 'u1',
        username: 'ada',
        displayName: 'Ada L',
        email: 'ada@example.com',
        roles: ['user'],
      },
      accessToken: async () => 'tok-live',
      onUnauthorized: () => 'ended' as const,
      signOut: null,
      subscribeAuthState: (onChange) => {
        signOutTheSession = () => onChange(null);
        return () => {
          signOutTheSession = () => {};
        };
      },
    },
  };
}

/** Fires the host's "nobody is signed in" notification at the real panel. */
let signOutTheSession: () => void = () => {};

beforeEach(() => {
  resetPageSingletonsForTests();
  localStorage.clear();
  consoleErrors.length = 0;
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args);
  });
  vi.stubGlobal('fetch', stubBackend());
  // happy-dom ships neither of these and the shared UI uses both.
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
  clearApiTransport();
  clearHostEndpoints();
  clearHostStore();
});

async function mountRealPanel() {
  const host = stubHost();
  setHostStore(host.store);
  setHostEndpoints(host.endpoints);
  setApiTransport({
    baseUrl: () => host.endpoints.apiUrl(),
    accessToken: () => host.session.accessToken(),
    sessionId: async () => null,
    clearSession: async () => {},
    onUnauthorized: () => host.session.onUnauthorized(),
  });
  // The host asserts the environment is ready, exactly as CopilotPanelMount does.
  await host.store.set({ hasCompletedFirstRun: true });

  return render(<CopilotPanel host={host} initialCase={{ kind: 'new' }} />);
}

describe('the real @faultmaven/copilot-ui panel, in this host', () => {
  it('mounts without a missing-provider crash', async () => {
    const { container } = await mountRealPanel();

    await waitFor(() => {
      expect(container.textContent).not.toMatch(/connecting to faultmaven/i);
    });

    const errorText = consoleErrors.map((args) => args.map(String).join(' ')).join('\n');
    expect(
      errorText,
      'the package threw for want of a React context this host did not install',
    ).not.toMatch(/QueryClient|Provider/i);
  });

  it('renders the panel, not an error boundary', async () => {
    const { container } = await mountRealPanel();

    await waitFor(() => {
      expect(container.textContent).not.toMatch(/connecting to faultmaven/i);
    });

    for (const fallback of BOUNDARY_FALLBACKS) {
      expect(screen.queryByText(fallback), `error boundary fallback ${fallback}`).toBeNull();
    }
    // Something of the panel is actually on screen — so "no fallback" is not
    // being satisfied by an empty tree.
    expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
    // And it holds a session, kept for this host's user. A mint the panel
    // refused renders nothing (its error is never shown), so without this the
    // smoke test stays green over a panel that has no session.
    await waitFor(() => {
      expect(localStorage.getItem(`${PANEL_STORAGE_NAMESPACE}sessionId`)).toBe('"sess-1"');
      expect(localStorage.getItem(`${PANEL_STORAGE_NAMESPACE}sessionUserId`)).toBe('"u1"');
    });
  });
});


describe('sign-out leaves nothing of the previous user behind', () => {
  /**
   * The residue defect, asserted through the REAL package.
   *
   * `signOut` is null here — the Dashboard's own account menu owns it — so the
   * panel learns the session ended only as a notification. That path used to
   * bump an epoch and stop, leaving the previous user's conversations, titles,
   * pins, active case and session id in `fm.copilot.*`. The next person to sign
   * in on the same browser hydrated them and sent the previous user's
   * `X-Session-Id`.
   *
   * A mocked package cannot show this: the purge is the package's, and what is
   * being checked is that this host's namespace is what gets purged.
   */
  function panelNamespaceKeys(): string[] {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PANEL_STORAGE_NAMESPACE))
      .map((k) => k.slice(PANEL_STORAGE_NAMESPACE.length))
      .sort();
  }

  it('empties fm.copilot.* when the host reports the session ended', async () => {
    const { container } = await mountRealPanel();
    await waitFor(() => {
      expect(container.textContent).not.toMatch(/connecting to faultmaven/i);
    });

    // State a signed-in session would have accumulated.
    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}conversations`, JSON.stringify({ 'case-1': [] }));
    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}conversationTitles`, JSON.stringify({ 'case-1': 'A' }));
    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}pinnedCases`, JSON.stringify(['case-1']));
    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}sessionId`, JSON.stringify('sess-1'));
    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}faultmaven_current_case`, JSON.stringify('case-1'));
    localStorage.setItem(
      `${PANEL_STORAGE_NAMESPACE}faultmaven_case_cache`,
      JSON.stringify({ cases: [{ case_id: 'case-1', title: 'PREVIOUS USER SECRET CASE' }], timestamp: Date.now() }),
    );
    expect(panelNamespaceKeys().length).toBeGreaterThan(0);

    await act(async () => {
      signOutTheSession();
    });

    await waitFor(() => {
      // `hasCompletedFirstRun` may survive: it is a boolean about onboarding,
      // not about a person, and it belongs to the browser rather than the
      // session. Anything else is the previous user's.
      expect(panelNamespaceKeys().filter((k) => k !== 'hasCompletedFirstRun')).toEqual([]);
    });
  });

  it('does the same when the sign-out came from ANOTHER TAB', async () => {
    // Same channel, because AuthManager funnels every kind of session end onto
    // `onAuthCleared` — so a cross-tab sign-out cannot leave residue that a
    // local one clears.
    const { container } = await mountRealPanel();
    await waitFor(() => {
      expect(container.textContent).not.toMatch(/connecting to faultmaven/i);
    });
    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}conversations`, JSON.stringify({ 'case-9': [] }));

    await act(async () => {
      signOutTheSession();
    });

    await waitFor(() => {
      expect(panelNamespaceKeys().filter((k) => k !== 'hasCompletedFirstRun')).toEqual([]);
    });
  });

  it('leaves no CONTENT of the previous user anywhere in the namespace', async () => {
    // The assertion that matters, phrased over VALUES rather than key names: a
    // key list can be extended without anyone remembering to extend the purge,
    // and that is exactly what happened — `faultmaven_case_cache` holds
    // `UserCase[]`, case ids and titles included, and is not in the list
    // `clearAllPersistenceData` removes.
    const { container } = await mountRealPanel();
    await waitFor(() => {
      expect(container.textContent).not.toMatch(/connecting to faultmaven/i);
    });

    localStorage.setItem(
      `${PANEL_STORAGE_NAMESPACE}faultmaven_case_cache`,
      JSON.stringify({
        cases: [{ case_id: 'case-1', title: 'PREVIOUS USER SECRET CASE' }],
        timestamp: Date.now(),
      }),
    );

    await act(async () => {
      signOutTheSession();
    });

    await waitFor(() => {
      const surviving = Object.keys(localStorage)
        .filter((k) => k.startsWith(PANEL_STORAGE_NAMESPACE))
        .map((k) => localStorage.getItem(k) ?? '')
        .join('\n');
      expect(surviving).not.toMatch(/PREVIOUS USER SECRET CASE/);
    });
  });
});

describe('the session mint, through this host’s real mount (faultmaven#1460)', () => {
  /**
   * Only with a bearer, only for the signed-in user, and never a sign-out the
   * Dashboard did not decide.
   *
   * Mounted through `CopilotPanelMount`, so the session is the one this host
   * builds and the transport is the one it installs, which hands a refused
   * bearer to `onUnauthorized`. Each test loads its own copy of the package:
   * the store, the session epoch and the timers are module state, and the
   * package exports no reset.
   */

  /** Long enough that no heartbeat runs on its own: a test runs the tick it means. */
  const HEARTBEAT_MS = 3_600_000;

  /** One of the panel's keys, as this host's store holds it. */
  const stored = (key: string) => localStorage.getItem(`${PANEL_STORAGE_NAMESPACE}${key}`);

  /** Lets every continuation already queued run, so an absence is not merely "not yet". */
  const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  const credential = (token: string | null) =>
    auth.getAccessTokenFor.mockResolvedValue(token ? { kind: 'token', token } : { kind: 'none' });

  beforeEach(() => {
    builtSessions.length = 0;
    credential('tok-live');
    auth.peekAccessToken.mockReset().mockResolvedValue(null);
    // A refresh that renewed nothing, after which AuthManager holds no session.
    auth.refreshTokens.mockReset().mockResolvedValue(null);
    auth.holdsSessionFor.mockReset().mockResolvedValue(false);
    auth.isSigningOut.mockReset().mockReturnValue(false);
    auth.onAuthCleared.mockReset().mockReturnValue(() => {});
    localStorage.setItem(`${PANEL_STORAGE_NAMESPACE}hasCompletedFirstRun`, 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function mountThroughHost() {
    vi.resetModules();
    // Read when the session slice loads, so before the import below.
    vi.stubEnv('VITE_HEARTBEAT_INTERVAL_MS', String(HEARTBEAT_MS));
    const intervals = vi.spyOn(globalThis, 'setInterval');
    // Loaded before the render, so the waits below are not spent loading it.
    await import('@faultmaven/copilot-ui');
    const { default: CopilotPanelMount } = await import('../../copilot/CopilotPanelMount');
    const result = render(
      <MemoryRouter>
        <CopilotPanelMount initialCase={{ kind: 'new' }} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(builtSessions).toHaveLength(1));
    const heartbeat = () => intervals.mock.calls.find(([, ms]) => ms === HEARTBEAT_MS)?.[0];
    // Started by the session's init, before its first ensure.
    await waitFor(() => expect(heartbeat()).toBeTypeOf('function'));
    /** One heartbeat tick, run now and awaited to its end. */
    const beat = () => act(async () => (heartbeat() as () => Promise<void>)());
    return { ...result, beat };
  }

  /** The verdict the host gave the panel's first 401. */
  const firstVerdict = () => vi.mocked(builtSessions[0].onUnauthorized).mock.results[0]?.value;

  it('(a) sends no mint while the host has no credential to give, and mints with the first it has', async () => {
    credential(null);
    const sent: SentRequest[] = [];
    vi.stubGlobal('fetch', stubBackend(sent));

    const { beat } = await mountThroughHost();
    await settle();

    expect(sent.filter(isMint)).toEqual([]);
    expect(builtSessions[0].onUnauthorized).not.toHaveBeenCalled();
    expect(auth.refreshTokens).not.toHaveBeenCalled();
    expect(stored('sessionId')).toBeNull();

    // The absence above is the mint declining, not a mint that never ran: the
    // next ensure sends it, as soon as there is a bearer to send it with.
    credential('tok-live');
    await settle();
    expect(sent.filter(isMint)).toEqual([]);
    await beat();

    const mints = sent.filter(isMint);
    expect(mints).toHaveLength(1);
    expect(mints[0].headers.get('Authorization')).toBe('Bearer tok-live');
    expect(stored('sessionUserId')).toBe('"u1"');
  });

  it('(b) mints with the bearer, keeps the session for its user, and sends it next', async () => {
    const sent: SentRequest[] = [];
    vi.stubGlobal('fetch', stubBackend(sent));

    const { container } = await mountThroughHost();
    await waitFor(() => expect(stored('sessionUserId')).toBe('"u1"'));

    const mints = sent.filter(isMint);
    expect(mints).toHaveLength(1);
    expect(mints[0].headers.get('Authorization')).toBe('Bearer tok-live');
    expect(stored('sessionId')).toBe('"sess-1"');

    // The next `/cases` request, a question asked, carries that session.
    const before = sent.length;
    await userEvent.type(container.querySelector('textarea') as HTMLTextAreaElement, 'why is checkout slow{Enter}');
    await waitFor(() => expect(sent.slice(before).some((r) => r.path.startsWith('/api/v1/cases'))).toBe(true));
    const next = sent.slice(before).find((r) => r.path.startsWith('/api/v1/cases'));
    expect(next?.headers.get('X-Session-Id')).toBe('sess-1');
    expect(next?.headers.get('Authorization')).toBe('Bearer tok-live');
  });

  it('(c) takes a session minted for another user as a refused bearer, and keeps none', async () => {
    const sent: SentRequest[] = [];
    vi.stubGlobal('fetch', stubBackend(sent, (r) => (isMint(r) ? json({ session_id: 'sess-1', user_id: 'someone-else' }) : undefined)));

    await mountThroughHost();
    await waitFor(() => expect(builtSessions[0].onUnauthorized).toHaveBeenCalled());
    await settle();

    expect(sent.filter(isMint)).toHaveLength(1);
    expect(builtSessions[0].onUnauthorized).toHaveBeenCalledExactlyOnceWith('tok-live');
    expect(auth.refreshTokens).toHaveBeenCalledWith('tok-live');
    expect(stored('sessionId')).toBeNull();
    expect(stored('sessionUserId')).toBeNull();
  });

  it("(d) a renewal that fails for now keeps the panel signed in: 'unavailable', not a sign-out", async () => {
    // The API refuses the bearer, and the refresh renews nothing while
    // AuthManager keeps the session (a 5xx or offline renewal).
    auth.holdsSessionFor.mockResolvedValue(true);
    const sent: SentRequest[] = [];
    const refused = (r: SentRequest) => isMint(r) || r.path.startsWith('/api/v1/cases');
    vi.stubGlobal('fetch', stubBackend(sent, (r) => (refused(r) ? json({ detail: 'Unauthorized' }, 401) : undefined)));

    const { container } = await mountThroughHost();
    await waitFor(() => expect(builtSessions[0].onUnauthorized).toHaveBeenCalledWith('tok-live'));
    await expect(firstVerdict()).resolves.toBe('unavailable');

    // A question refused the same way is not sent, and the panel says so as a
    // connection problem: no expired session, no sign-in. It shows once the
    // client's own retries (1 s, then 2 s) are spent.
    await userEvent.type(container.querySelector('textarea') as HTMLTextAreaElement, 'why is checkout slow{Enter}');
    await waitFor(() => expect(document.body.textContent).toMatch(/Unable to reach FaultMaven server.*Send again to retry/), {
      timeout: 10_000,
    });
    expect(document.body.textContent).not.toMatch(/sign in|session has expired/i);
  }, 15_000);

  it("(e) retries a refused mint once with the credential the host renewed: 'refreshed'", async () => {
    let token = 'tok-live';
    auth.getAccessTokenFor.mockImplementation(async () => ({ kind: 'token', token }));
    auth.refreshTokens.mockImplementation(async () => (token = 'tok-new'));
    const sent: SentRequest[] = [];
    const renewedOnly = (r: SentRequest) =>
      r.headers.get('Authorization') === 'Bearer tok-new'
        ? json({ session_id: 'sess-1', user_id: 'u1' })
        : json({ detail: 'Unauthorized' }, 401);
    vi.stubGlobal('fetch', stubBackend(sent, (r) => (isMint(r) ? renewedOnly(r) : undefined)));

    await mountThroughHost();
    await waitFor(() => expect(stored('sessionUserId')).toBe('"u1"'));

    expect(sent.filter(isMint).map((r) => r.headers.get('Authorization'))).toEqual(['Bearer tok-live', 'Bearer tok-new']);
    expect(auth.refreshTokens).toHaveBeenCalledExactlyOnceWith('tok-live');
    await expect(firstVerdict()).resolves.toBe('refreshed');
    expect(stored('sessionId')).toBe('"sess-1"');
  });

  it('(f) re-mints at once when a heartbeat finds the session gone, not at the next beat', async () => {
    let minted = 0;
    const sent: SentRequest[] = [];
    vi.stubGlobal(
      'fetch',
      stubBackend(sent, (r) => {
        if (isMint(r)) return json({ session_id: `sess-${++minted}`, user_id: 'u1' });
        // An API restart: standalone's in-process store forgot `sess-1`.
        if (isHeartbeat(r) && r.path.includes('/sess-1/')) return json({ detail: 'Session not found' }, 404);
      }),
    );

    const { beat } = await mountThroughHost();
    await waitFor(() => expect(stored('sessionId')).toBe('"sess-1"'));

    await beat();

    expect(sent.filter((r) => isMint(r) || isHeartbeat(r)).map((r) => r.path)).toEqual([
      '/api/v1/sessions',
      '/api/v1/sessions/sess-1/heartbeat',
      '/api/v1/sessions',
    ]);
    expect(stored('sessionId')).toBe('"sess-2"');
    expect(stored('sessionUserId')).toBe('"u1"');
  });
});

// The sign-out-plus-unmount RACE lives in `signOutRace.test.tsx`, which mounts
// through `CopilotPanelMount` so the cleanup effect under test is actually in
// the tree. A version of it here rendered `CopilotPanel` directly and therefore
// passed against the very ordering it was written to catch.
