import { act, render, screen, waitFor } from '@testing-library/react';
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
import { PANEL_STORAGE_NAMESPACE, createWebHostCapabilities } from '../../copilot/webHost';

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

function stubBackend() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    if (url.includes('/capabilities')) {
      return json({ features: {}, dashboardUrl: 'http://localhost:3333' });
    }
    if (url.includes('/sessions')) {
      return json({ session_id: 'sess-1', created_at: new Date().toISOString() });
    }
    if (url.includes('/cases')) {
      return json({ cases: [], total_count: 0 });
    }
    if (url.includes('/knowledge') || url.includes('/documents')) {
      return json({ documents: [], total_count: 0 });
    }
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
