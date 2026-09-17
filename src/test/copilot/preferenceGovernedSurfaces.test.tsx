import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Every surface "use the Copilot extension for chat" governs (ADR-018 D3).
 *
 * Four of them shipped with no test at all: the `New Case` nav item, the
 * `/investigate` route guard, the sign-in landing, and the case list's two
 * CTAs. Each existing suite exercised only the default-off path, so re-adding
 * the nav item unconditionally, or deleting the route guard, left every test
 * green — against this repo's own "NO CODE MERGES WITHOUT TESTS".
 *
 * ‼ THE ROUTE GUARD IS NOT TESTED HERE, and that is deliberate. It used to be,
 * through a hand-built `<MemoryRouter><Routes>` that mounted `ChatSurfaceRoute`
 * directly — which tested the component and NOT the wiring, so deleting
 * `<ChatSurfaceRoute>` from `App.tsx` left all 1200 tests green. It now lives
 * in `panelNotBeforeSignIn.test.tsx`, on App's real route table, where a
 * bookmark or a back button actually arrives. That also keeps App out of this
 * file: importing it dragged the whole route graph through Vite's transform
 * for ten tests, eight of which never needed it.
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
