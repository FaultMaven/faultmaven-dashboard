import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import type { CaseSummary } from '../../types/cases';
import { setPrefersExtensionForChat } from '../../lib/copilot/chatSurfacePreference';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CaseListPage from '../../pages/CaseListPage';
import { cellUnderHeader, asRendered } from '../support/caseDateColumn';

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

import { listCases, searchCases } from '../../lib/api';

const mockListCases = listCases as ReturnType<typeof vi.fn>;
const mockSearchCases = searchCases as ReturnType<typeof vi.fn>;

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

/**
 * The date range, end to end on the page that owns it.
 *
 * The unit tests below this hold each half: `dateRange` resolves a day, `api`
 * sends the contract's names, `CaseFiltersBar` renders the controls. What none
 * of them can see is whether the picked day ever reaches the request — which is
 * exactly the link that was missing for the whole life of #51.
 */
describe('CaseListPage — the creation-date range reaches the request', () => {
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

  it('re-fetches with the bounds when a day is picked', async () => {
    await act(async () => { renderPage(); });
    await waitFor(() => expect(mockListCases).toHaveBeenCalled());
    mockListCases.mockClear();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Created from'), {
        target: { value: '2026-09-10' },
      });
    });

    await waitFor(() => expect(mockListCases).toHaveBeenCalled());
    // The page passes the picked DAY down; `listCases` is where it becomes an
    // instant, so that is the shape asserted here.
    expect(mockListCases).toHaveBeenCalledWith(
      expect.objectContaining({ date_from: '2026-09-10' }),
      0,
      expect.any(Number),
    );
  });

  it('does not call a filtered-to-nothing list a FIRST RUN', async () => {
    // Every predicate lives in the same WHERE clause as the COUNT — deliberately,
    // it is what keeps pagination sound — so a filtered list reports the FILTERED
    // total. Reading `total_count === 0` as "this account has no cases" therefore
    // told a user with forty of them "No cases yet." over a `+ New Case` button,
    // the moment their date range matched nothing. The creation-date range is the
    // filter most likely to match nothing, which is how this surfaced.
    mockListCases.mockResolvedValue({
      cases: [],
      total_count: 0,
      page: 0,
      page_size: 20,
      has_more: false,
    });

    await act(async () => { renderPage(); });
    await waitFor(() => expect(mockListCases).toHaveBeenCalled());

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Created from'), {
        target: { value: '2026-01-01' },
      });
    });

    await waitFor(() =>
      expect(screen.getByText(/no cases match these filters/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/no cases yet/i)).not.toBeInTheDocument();
  });

  it('still says "No cases yet" when nothing is filtering and there is nothing there', async () => {
    // The fix must not swallow the real first run — which is the state the whole
    // empty-state copy exists for.
    mockListCases.mockResolvedValue({
      cases: [],
      total_count: 0,
      page: 0,
      page_size: 20,
      has_more: false,
    });

    await act(async () => { renderPage(); });

    await waitFor(() => expect(screen.getByText(/no cases yet/i)).toBeInTheDocument());
  });

  it('greys the dates out once a search term is set', async () => {
    // Keyed on `filters.search`, which the debounce is what SETS — so the
    // inputs stay live while the user types and grey out exactly when a search
    // becomes what happens next. A flag set after the response would be wrong
    // in both directions whenever a request fails.
    const { searchCases } = await import('../../lib/api');
    (searchCases as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await act(async () => { renderPage(); });
    await waitFor(() => expect(screen.getByLabelText('Created from')).toBeEnabled());

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search cases'), {
        target: { value: 'payment' },
      });
    });

    await waitFor(() => expect(screen.getByLabelText('Created from')).toBeDisabled());
    expect(screen.getByLabelText('Created to')).toBeDisabled();
  });
});

/**
 * WHICH DATE the list shows, end to end (faultmaven-dashboard#155).
 *
 * #154 restored a creation-date range over a table whose only date was
 * `last_activity_at`, so filtering `Created 1 Sept – 1 Sept` returned rows
 * dated the 20th. That reads as a broken filter — which is exactly the symptom
 * #51 was reported as, so the restored filter could be mistaken for the bug it
 * had just fixed.
 *
 * Driven through the REAL `CaseFiltersBar`, debounce included, because the
 * decision is a property of the page and its filters rather than of a prop
 * handed to a component in isolation.
 */
describe('CaseListPage — the date column follows the creation-date filter', () => {
  // 19 days apart: more than any timezone offset, so they are different
  // calendar days wherever this runs. Nothing below asserts a frozen date
  // string — `asRendered` makes the same call the component does.
  const datedCase: CaseSummary = {
    ...sampleCase,
    created_at: '2026-09-01T12:00:00Z',
    last_activity_at: '2026-09-20T12:00:00Z',
  };

  /**
   * FAKE TIMERS, and not as a stylistic preference.
   *
   * The bar debounces every date and search write by 300ms of real
   * `setTimeout`. Driving these cases through it cost ~9s of wall clock, and
   * the CPU contention that created pushed an unrelated suite
   * (`preferenceGovernedSurfaces`) past its 5s timeout — reproducible with just
   * those two files, green for each of them alone. Real time spent waiting is
   * not coverage; the debounce itself is covered in `CaseFiltersBar.test.tsx`.
   *
   * `waitFor` is deliberately unused in here: with the clock faked it would
   * poll a timer that never advances on its own. `settle()` advances it
   * instead, which also flushes the promise the advance sets off.
   */
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // `vi.clearAllMocks()` clears CALLS, not IMPLEMENTATIONS — a
    // `mockRejectedValue` set by one test would otherwise outlive it and make
    // these order-dependent. Both clients are re-armed explicitly.
    mockListCases.mockResolvedValue({
      cases: [datedCase],
      total_count: 1,
      page: 0,
      page_size: 20,
      has_more: false,
    });
    mockSearchCases.mockResolvedValue([datedCase]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Advance past every debounce and let the requests they fire settle. */
  async function settle() {
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
    }
  }

  async function renderSettled() {
    await act(async () => {
      renderPage();
    });
    await settle();
  }

  /** Type into one of the bar's debounced inputs and let everything settle. */
  async function typeInto(label: string, value: string) {
    await act(async () => {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    });
    await settle();
  }

  it('shows Last Activity while nothing is filtering by creation date', async () => {
    await renderSettled();

    expect(cellUnderHeader('Last Activity')).toHaveTextContent(
      asRendered(datedCase.last_activity_at),
    );
    expect(screen.queryByRole('columnheader', { name: 'Created' })).toBeNull();
  });

  it('swaps to Created — the value being filtered — once a lower bound is picked', async () => {
    await renderSettled();
    await typeInto('Created from', '2026-09-01');

    // The header names the date, so the swap is not silent.
    expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();
    // ...and the cell under it is the creation date, not last activity.
    expect(cellUnderHeader('Created')).toHaveTextContent(asRendered(datedCase.created_at));
    expect(cellUnderHeader('Created')).not.toHaveTextContent(
      asRendered(datedCase.last_activity_at),
    );
    expect(screen.queryByRole('columnheader', { name: 'Last Activity' })).toBeNull();
  });

  it('swaps on an UPPER bound alone too — one bound is a real filter', async () => {
    // `created_before` narrows the list on its own; a rule that waited for both
    // bounds would leave the half-open case showing the wrong date.
    await renderSettled();
    await typeInto('Created to', '2026-09-30');

    expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();
    expect(cellUnderHeader('Created')).toHaveTextContent(asRendered(datedCase.created_at));
  });

  it('does NOT swap for a year still being typed, which sends no bound', async () => {
    // A date input reports `0002-09-14` on the way to `2026-09-14`, and
    // `dateRange` cannot resolve it — so `listCases` sends no `created_after`
    // and the column must not claim one. The debounce narrows this window; it
    // does not close it.
    await renderSettled();
    await typeInto('Created from', '0002-09-14');

    expect(screen.getByRole('columnheader', { name: 'Last Activity' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Created' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Date column: Last Activity');

    // The request really did go out without a bound — the column is agreeing
    // with the query, not merely being cautious.
    // Indexed, not `.at(-1)`: `tsconfig.eslint.json`'s `lib` predates
    // `Array.prototype.at`, and the test typecheck is held at zero NEW errors.
    const { calls } = mockListCases.mock;
    const sent = calls[calls.length - 1]?.[0];
    expect(sent).toEqual({ date_from: '0002-09-14' });

    // ...and finishing the year swaps it, so this is not just "never swaps".
    await typeInto('Created from', '2026-09-14');
    expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();
  });

  it('goes back to Last Activity when the range is cleared', async () => {
    await renderSettled();
    await typeInto('Created from', '2026-09-01');
    expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Clear/ }));
    });
    await settle();

    expect(screen.getByRole('columnheader', { name: 'Last Activity' })).toBeInTheDocument();
    expect(cellUnderHeader('Last Activity')).toHaveTextContent(
      asRendered(datedCase.last_activity_at),
    );
  });

  it('goes back to Last Activity while a SEARCH suspends the range', async () => {
    // `POST /cases/search` accepts no date bounds, so the bar disables the
    // inputs and the hook sends none — but the range is deliberately KEPT in
    // `filters` so it returns when the box empties. Heading the column
    // `Created` on the strength of a bound that is not being applied would be
    // the same lie in the other direction.
    await renderSettled();
    await typeInto('Created from', '2026-09-01');
    expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();

    await typeInto('Search cases', 'payment');

    // The range is still in `filters` — the inputs are disabled, not cleared —
    // but it is not being applied, so the column stops claiming it is.
    expect(screen.getByLabelText('Created from')).toBeDisabled();
    expect(screen.getByRole('columnheader', { name: 'Last Activity' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Created' })).toBeNull();
    expect(cellUnderHeader('Last Activity')).toHaveTextContent(
      asRendered(datedCase.last_activity_at),
    );
  });

  it('announces the swap, because nothing is focused to notice it', async () => {
    // When the column swaps there is nothing focused to notice it: measured,
    // `CaseFiltersBar`'s `key`ed date input remounts on the debounced write and
    // `document.activeElement` is `<body>` (pre-existing from #154). The only
    // other statement of the new date is a `<th>` the user must navigate into.
    // The region is built from the same resolved value as that header, so the
    // two cannot name different columns.
    await renderSettled();
    expect(screen.getByRole('status')).toHaveTextContent('Date column: Last Activity');

    await typeInto('Created from', '2026-09-01');

    expect(screen.getByRole('status')).toHaveTextContent('Date column: Created');
    expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();
  });

  it('keeps the region node across branches but NOT its sentence', async () => {
    // The node is stable — registered once at mount, never inserted with
    // content already in it. The SENTENCE is not: with no rows there is no date
    // column, and announcing "Date column: Created" straight after "No cases
    // match these filters." names something that is not on screen.
    mockListCases.mockResolvedValue({
      cases: [], total_count: 0, page: 0, page_size: 20, has_more: false,
    });

    await renderSettled();

    expect(screen.getByTestId('cases-empty-state')).toBeInTheDocument();
    // Present…
    expect(screen.getByRole('status')).toBeInTheDocument();
    // …and silent.
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('says nothing about a date column while the first load is still running', async () => {
    // `CaseTable` renders "Loading cases..." instead of a header, so there is
    // no column to name yet.
    let release: (v: unknown) => void = () => {};
    mockListCases.mockReturnValue(new Promise((r) => { release = r; }));

    await act(async () => {
      renderPage();
    });
    expect(screen.getByRole('status').textContent).toBe('');

    await act(async () => {
      release({ cases: [datedCase], total_count: 1, page: 0, page_size: 20, has_more: false });
    });
    await settle();

    expect(screen.getByRole('status')).toHaveTextContent('Date column: Last Activity');
  });

  /**
   * THE COLUMN DESCRIBES THE ROWS IN HAND, not the filters about to be applied.
   *
   * `useCaseList` already models this for `searchMode` — "a property of the
   * LAST RESPONSE" — and the column needs the same treatment, because the two
   * come apart exactly when a request fails and the previous rows stay on
   * screen.
   */
  describe('a request that never landed does not get to describe the list', () => {
    it('leaves stale unfiltered rows headed Last Activity when the range 422s', async () => {
      // An inverted range (`from` after `to`) is refused by the server. `cases`
      // still holds the last unfiltered page, and the page renders those rows
      // — the empty-state branch needs `!error`. Reading the PENDING filters
      // would head them `Created` with `created_at` cells, over a result set no
      // creation-date bound ever touched.
      await renderSettled();
      expect(screen.getByRole('columnheader', { name: 'Last Activity' })).toBeInTheDocument();

      mockListCases.mockRejectedValue(new Error('created_after must be before created_before'));
      await typeInto('Created from', '2026-09-20');
      await typeInto('Created to', '2026-09-01');

      expect(screen.getByText(/created_after must be before/)).toBeInTheDocument();
      // The rows are still the unfiltered ones…
      expect(screen.getByText('Database Outage')).toBeInTheDocument();
      // …so the column still describes them.
      expect(screen.getByRole('columnheader', { name: 'Last Activity' })).toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: 'Created' })).toBeNull();
      expect(cellUnderHeader('Last Activity')).toHaveTextContent(
        asRendered(datedCase.last_activity_at),
      );
      expect(screen.getByRole('status')).toHaveTextContent('Date column: Last Activity');
    });

    it('leaves date-filtered rows headed Created when a search fails', async () => {
      // The mirror image: a rejected search leaves `filters.search` set while
      // the rows on screen are still the date-filtered ones, so reading the
      // pending filters would revert the column under rows it no longer
      // describes.
      await renderSettled();
      await typeInto('Created from', '2026-09-01');
      expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();

      mockSearchCases.mockRejectedValue(new Error('search unavailable'));
      await typeInto('Search cases', 'payment');

      expect(screen.getByText('search unavailable')).toBeInTheDocument();
      // The rows never changed, so neither does the column that describes them.
      expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: 'Last Activity' })).toBeNull();
      expect(cellUnderHeader('Created')).toHaveTextContent(asRendered(datedCase.created_at));
    });
  });
});
