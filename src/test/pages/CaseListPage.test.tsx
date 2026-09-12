import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import type { CaseSummary } from '../../types/cases';
import { setPrefersExtensionForChat } from '../../lib/copilot/chatSurfacePreference';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CaseListPage from '../../pages/CaseListPage';

// Shared mock setup (same pattern as App.test.tsx). The Dashboard is read-only
// for cases (D1) — there is no archive/mutation client to mock here.
vi.mock('../../lib/api', async () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  listCases: vi.fn(),
  searchCases: vi.fn(),
  authManager: (await import('../support/authFixtures')).makeAuthManagerMock(),
  config: { apiUrl: 'http://localhost:8090' },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({
    deployment: 'standalone',
    role: 'individual',
    clearAuthState: vi.fn(),
    isAuthenticated: true,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useNavigationItems', () => ({
  useNavigationItems: vi.fn().mockReturnValue([
    { label: 'Cases', path: '/cases', active: true },
    { label: 'Knowledge Base', path: '/kb', active: false },
  ]),
}));

import { listCases } from '../../lib/api';

const mockListCases = listCases as ReturnType<typeof vi.fn>;

const sampleCase: CaseSummary = {
  case_id: 'case-1',
  title: 'Database Outage',
  description: 'Primary DB is unresponsive',
  state: 'investigating' as const,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  last_activity_at: '2024-01-02T00:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'u1',
  enterprise_id: 'ent-1',
  current_turn: 5,
  source: 'copilot',
  stage: 'diagnosis',
  turns_without_progress: 0,
  is_terminal: false,
  shared_team_ids: [],
};

/**
 * Rendered inside the routes it can navigate to, so a redirect is OBSERVABLE.
 * A bare `<CaseListPage />` under MemoryRouter renders `<Navigate>` as nothing
 * at all, and "the panel opened instead of an empty list" would be
 * indistinguishable from "the page rendered nothing".
 */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/cases']}>
      <Routes>
        <Route path="/cases" element={<CaseListPage />} />
        <Route path="/investigate" element={<div data-testid="investigate-page">panel</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CaseListPage (read-only, D1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCases.mockResolvedValue({
      cases: [sampleCase],
      total_count: 1,
      page: 0,
      page_size: 20,
      has_more: false,
    });
  });

  it('renders the Cases heading', async () => {
    await act(async () => {
      renderPage();
    });

    expect(screen.getByRole('heading', { name: /^Cases$/i })).toBeInTheDocument();
  });

  it('shows case title as a link', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Database Outage')).toBeInTheDocument();
    });
  });

  it('shows status badge for case', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      // Badge renders in a <span>, not a <button>. Filter chips are <button>s.
      const spans = screen.getAllByText('Investigating');
      const badge = spans.find((el) => el.tagName === 'SPAN');
      expect(badge).toBeInTheDocument();
    });
  });

  it('renders no case-mutation controls (no Archive button, no include-archived toggle)', async () => {
    const resolvedCase = { ...sampleCase, state: 'resolved' as const, is_terminal: true };
    mockListCases.mockResolvedValue({
      cases: [resolvedCase],
      total_count: 1,
      page: 0,
      page_size: 20,
      has_more: false,
    });

    await act(async () => {
      renderPage();
    });

    await waitFor(() => expect(screen.getByText('Database Outage')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/include archived/i)).not.toBeInTheDocument();
  });

  it('stays on /cases and offers the panel when the account has no cases', async () => {
    // `/cases` is an ORDINARY PAGE again. It used to redirect to /investigate
    // whenever the rows in hand were empty, which made the route unreachable
    // for the very person it was meant to help and bounced anyone who paged
    // past the end or cleared a filter — `cases.length` cannot tell those
    // apart. The first-run question is asked once, at sign-in, by
    // `resolvePostSignInLanding()`.
    mockListCases.mockResolvedValue({ cases: [], total_count: 0, page: 0, page_size: 20, has_more: false });

    await act(async () => { renderPage(); });

    await waitFor(() => expect(screen.getByTestId('cases-empty-state')).toBeInTheDocument());
    expect(screen.queryByTestId('investigate-page')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Cases$/i })).toBeInTheDocument();
    expect(screen.getByText(/no cases yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /\+ New Case/i }).getAttribute('href'),
    ).toBe('/investigate');
  });

  it('does not bounce a user who paged PAST THE END of their cases', async () => {
    // An empty page of a non-empty account. The redirect keyed on
    // `cases.length` sent this person to a new investigation and hid the cases
    // they actually have; `total_count` is what distinguishes the two.
    mockListCases.mockResolvedValue({ cases: [], total_count: 42, page: 9, page_size: 20, has_more: false });

    await act(async () => { renderPage(); });

    await waitFor(() => expect(screen.getByTestId('cases-empty-state')).toBeInTheDocument());
    expect(screen.queryByTestId('investigate-page')).not.toBeInTheDocument();
    // It says "nothing matched", not "you have no cases".
    expect(screen.getByText(/no cases match these filters/i)).toBeInTheDocument();
    expect(screen.queryByText(/no cases yet/i)).not.toBeInTheDocument();
  });

  it('does not bounce a user who CLEARED a filter down to nothing', async () => {
    await act(async () => { renderPage(); });
    await waitFor(() => expect(screen.getByText('Database Outage')).toBeInTheDocument());

    mockListCases.mockResolvedValue({ cases: [], total_count: 0, page: 0, page_size: 20, has_more: false });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Resolved$/i }));
    });

    await waitFor(() => expect(screen.getByTestId('cases-empty-state')).toBeInTheDocument());
    expect(screen.queryByTestId('investigate-page')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /\+ New Case/i }).getAttribute('href'),
    ).toBe('/investigate');
  });

  it('does NOT redirect away from a failed load', async () => {
    // A failed load also leaves `cases` empty. Bouncing the user to the panel
    // would hide the reason their cases are missing and look like data loss.
    mockListCases.mockRejectedValue(new Error('API unreachable'));

    await act(async () => {
      renderPage();
    });

    await waitFor(() => expect(screen.getByText('API unreachable')).toBeInTheDocument());
    expect(screen.queryByTestId('investigate-page')).not.toBeInTheDocument();
  });

  it('shows error when fetch fails', async () => {
    mockListCases.mockRejectedValue(new Error('API unreachable'));

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('API unreachable')).toBeInTheDocument();
    });
  });
});

/**
 * ADR-018 D5, asserted against the RENDERED COPY rather than by review.
 *
 * A sweep rather than three string assertions. The three violations the ADR
 * names — "New investigation", "Start an investigation", "Start an
 * investigation and it will show up here." — are the ones that existed on the
 * day it was written; pinning exactly those would say nothing about the fourth
 * one added beside them next month, which is the only failure mode this
 * requirement has.
 *
 * What is banned is the NOUN. "Investigating" is the ADR-005 case state and is
 * correct copy — it is on the status badge and on a filter chip of this very
 * page — so the pattern demands the whole word plus a boundary, which
 * "Investigating" does not supply.
 */
const INVESTIGATION_NOUN = /investigations?\b/i;

function lexiconViolations(root: HTMLElement): string[] {
  const found: string[] = [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').trim();
    if (INVESTIGATION_NOUN.test(text)) found.push(`text: ${text}`);
  }

  // Copy a person reads that a text sweep cannot see: an icon-only control's
  // accessible name, a tooltip, an input's placeholder. A button labelled only
  // by `aria-label` is exactly where this would come back unnoticed.
  const carriers = ['aria-label', 'title', 'placeholder', 'alt'] as const;
  for (const el of Array.from(
    root.querySelectorAll<HTMLElement>('[aria-label], [title], [placeholder], [alt]'),
  )) {
    for (const attr of carriers) {
      const value = el.getAttribute(attr);
      if (value && INVESTIGATION_NOUN.test(value)) found.push(`${attr}: ${value}`);
    }
  }

  return found;
}

describe('CaseListPage with chat in the Copilot extension (ADR-018 D3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPrefersExtensionForChat(true);
  });

  afterEach(() => {
    setPrefersExtensionForChat(false);
  });

  it('hides both CTAs, because they lead to a surface this person declined', async () => {
    mockListCases.mockResolvedValue({ cases: [sampleCase], total_count: 1, page: 0, page_size: 20, has_more: false });
    renderPage();
    await waitFor(() => expect(screen.getByText(sampleCase.title)).toBeInTheDocument());

    expect(screen.queryByRole('link', { name: /New Case/i })).not.toBeInTheDocument();
  });

  it('points the first-run empty state at the Copilot instead', async () => {
    mockListCases.mockResolvedValue({ cases: [], total_count: 0, page: 0, page_size: 20, has_more: false });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('cases-empty-state')).toBeInTheDocument());

    expect(screen.getByText(/Start a new case from the Copilot/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /start a new case/i })).not.toBeInTheDocument();
  });

  it('does not offer an action the page no longer has, on a filtered-empty list', async () => {
    // The sentence used to end "…or start looking at something new" while the
    // only control behind it was hidden — pointing at nothing on the page.
    mockListCases.mockResolvedValue({ cases: [], total_count: 7, page: 0, page_size: 20, has_more: false });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('cases-empty-state')).toBeInTheDocument());

    expect(screen.getByText('Clear the filters to see everything.')).toBeInTheDocument();
    expect(screen.queryByText(/start looking at something new/)).not.toBeInTheDocument();
  });
});

describe('CaseListPage lexicon (ADR-018 D5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carries NO create button once the list has rows — the nav owns that now', async () => {
    // The nav renders `+ New Case` as a filled action on every page, so a
    // second create control in this header was two affordances for one thing.
    // The lexicon sweep still has real rendered copy to walk.
    mockListCases.mockResolvedValue({
      cases: [sampleCase],
      total_count: 1,
      page: 0,
      page_size: 20,
      has_more: false,
    });

    await act(async () => { renderPage(); });
    await waitFor(() => expect(screen.getByText('Database Outage')).toBeInTheDocument());

    expect(screen.queryByRole('link', { name: /New Case/i })).not.toBeInTheDocument();
    expect(lexiconViolations(document.body)).toEqual([]);
  });

  it('keeps the first-run empty state pointing at the full-page surface', async () => {
    mockListCases.mockResolvedValue({ cases: [], total_count: 0, page: 0, page_size: 20, has_more: false });

    await act(async () => { renderPage(); });
    await waitFor(() => expect(screen.getByTestId('cases-empty-state')).toBeInTheDocument());

    // The empty state KEEPS its button — it is the whole point of the page —
    // and now says the same thing the nav does.
    expect(screen.getByText('Start a new case and it will show up here.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /\+ New Case/ }).getAttribute('href'),
    ).toBe('/investigate');
    expect(lexiconViolations(document.body)).toEqual([]);
  });

  it('says nothing about an "investigation" in the filtered-empty state either', async () => {
    // The other empty state, which renders different copy and is the one a
    // sweep over a single fixture would miss.
    mockListCases.mockResolvedValue({ cases: [], total_count: 42, page: 9, page_size: 20, has_more: false });

    await act(async () => { renderPage(); });
    await waitFor(() => expect(screen.getByTestId('cases-empty-state')).toBeInTheDocument());

    expect(lexiconViolations(document.body)).toEqual([]);
  });

  it('leaves the ADR-005 STATE word alone — "Investigating" is not the banned noun', async () => {
    // The sweep has to be survivable by correct copy, or the next person
    // deletes it. A case in the investigating phase renders that word on its
    // badge and on a filter chip, and both are right.
    mockListCases.mockResolvedValue({
      cases: [sampleCase],
      total_count: 1,
      page: 0,
      page_size: 20,
      has_more: false,
    });

    await act(async () => { renderPage(); });
    await waitFor(() => expect(screen.getAllByText('Investigating').length).toBeGreaterThan(0));

    expect(lexiconViolations(document.body)).toEqual([]);
  });
});
