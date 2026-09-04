import { render, screen, waitFor } from '@testing-library/react';
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
import { createWebHostCapabilities } from '../../copilot/webHost';

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
      onUnauthorized: () => {},
      signOut: null,
      subscribeAuthState: () => () => {},
    },
  };
}

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
