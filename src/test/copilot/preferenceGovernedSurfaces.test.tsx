import { render, screen, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

/**
 * Every surface "use the Copilot extension for chat" governs (ADR-018 D3).
 *
 * Four of them shipped with no test at all: the `New Case` nav item, the
 * `/investigate` route guard, the sign-in landing, and the case list's two
 * CTAs. Each existing suite exercised only the default-off path, so re-adding
 * the nav item unconditionally, or deleting the route guard, left every test
 * green — against this repo's own "NO CODE MERGES WITHOUT TESTS".
 *
 * The preference governs INTERACTIVE surfaces only. That it never governs
 * reading a conversation is asserted where the conversation lives, in
 * `CaseDetailConversation.test.tsx`.
 */

vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => ({ managementConsole: false, teamSharing: false, loading: false }),
}));

const listCases = vi.fn();
vi.mock('../../lib/cases/api', () => ({
  listCases: (...args: unknown[]) => listCases(...args),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ deployment: 'standalone', role: 'individual', isAdmin: false }),
}));

// ‼ STATIC, like every other test file that touches `App`. This was
// `await import('../../App')` INSIDE the test body, and it is what made this
// file flaky: the import pulls the whole route graph through Vite's transform,
// and under CPU contention that exceeds the 5s test timeout. The second test
// then failed with "Found multiple elements" — a CASCADE, not a second bug:
// the timed-out test's `render` resolves AFTER RTL's `afterEach` cleanup has
// run, so its tree is left in the document for the next test to trip over.
//
// Paying the import once at module scope charges it to collection rather than
// to a single test's budget. `vi.mock` is hoisted above imports by the
// transform, so the mocks above still apply.
import { ChatSurfaceRoute } from '../../App';
import { useNavigationItems } from '../../hooks/useNavigationItems';
import { resolvePostSignInLanding } from '../../lib/auth/landing';
import {
  setPrefersExtensionForChat,
  resetChatSurfaceForTests,
} from '../../lib/copilot/chatSurfacePreference';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetChatSurfaceForTests();
});

describe('the New Case nav item', () => {
  const labels = () => renderHook(() => useNavigationItems('/cases')).result.current.map((i) => i.label);

  it('is present by default', () => {
    expect(labels()).toContain('New Case');
  });

  it('is absent once chat lives in the extension', () => {
    // It leads to a full-page composer this person has asked not to have.
    setPrefersExtensionForChat(true);
    expect(labels()).not.toContain('New Case');
  });

  it('comes straight back when the preference is turned off', () => {
    setPrefersExtensionForChat(true);
    setPrefersExtensionForChat(false);
    expect(labels()).toContain('New Case');
  });

  it('is marked as an ACTION, which is what stops it reading as a destination', () => {
    // The flag is what PageHeader renders differently. Asserting only the
    // label and path — as the existing suite did — passes unchanged with
    // `action` deleted, and the nav silently goes back to looking like a row
    // of places to go.
    const items = renderHook(() => useNavigationItems('/cases')).result.current;
    const newCase = items.find((i) => i.label === 'New Case');

    expect(newCase?.action).toBe(true);
    // …and nothing else claims to be one.
    expect(items.filter((i) => i.action).map((i) => i.label)).toEqual(['New Case']);
  });

  it('removes ONLY that item', () => {
    const before = labels();
    setPrefersExtensionForChat(true);
    const after = labels();

    expect(before.filter((l) => l !== 'New Case')).toEqual(after);
  });
});

describe('the /investigate route', () => {
  function Harness() {
    const { pathname } = useLocation();
    return <span data-testid="where">{pathname}</span>;
  }

  function renderAt(path: string) {
    // The real guard, with a stand-in for the page so this test is about the
    // routing decision rather than about mounting a panel.
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/investigate"
            element={
              <ChatSurfaceRoute>
                <span data-testid="investigate-page" />
              </ChatSurfaceRoute>
            }
          />
          <Route path="/cases" element={<span data-testid="cases-page" />} />
        </Routes>
        <Harness />
      </MemoryRouter>,
    );
  }

  it('renders the full-page surface by default', () => {
    renderAt('/investigate');
    expect(screen.getByTestId('investigate-page')).toBeInTheDocument();
  });

  it('redirects to /cases once chat lives in the extension', async () => {
    // The nav item goes too, but a ROUTE needs its own guard: a bookmark, a
    // back button or a stale link would otherwise mount a second composer for
    // someone who has explicitly asked for one surface.
    setPrefersExtensionForChat(true);
    renderAt('/investigate');

    expect(screen.queryByTestId('investigate-page')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/cases'));
  });
});

describe('the post-sign-in landing', () => {
  it('sends a zero-case account to the first-run surface by default', async () => {
    listCases.mockResolvedValue({ total_count: 0 });
    await expect(resolvePostSignInLanding()).resolves.toBe('/investigate');
  });

  it('sends them to the case list instead once chat lives in the extension', async () => {
    // ADR-018 D3's note on D6: with the preference on the first-run surface
    // does not exist, so the empty state points at the Copilot rather than at a
    // route that would redirect straight back.
    setPrefersExtensionForChat(true);
    await expect(resolvePostSignInLanding()).resolves.toBe('/cases');
  });

  it('does not even ask for the count, because it cannot change the answer', async () => {
    setPrefersExtensionForChat(true);
    await resolvePostSignInLanding();

    expect(listCases).not.toHaveBeenCalled();
  });
});
