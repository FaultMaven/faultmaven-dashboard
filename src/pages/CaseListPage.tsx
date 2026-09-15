import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { CaseTable } from '../components/CaseTable';
import { CaseFiltersBar } from '../components/CaseFiltersBar';
import { PaginationControls } from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { useCaseList } from '../hooks/useCaseList';
import { useTeamSharing } from '../hooks/useTeamSharing';
import { logoutAuth } from '../lib/api';
import { usePrefersExtensionForChat } from '../hooks/useChatSurface';
import { resolveCaseDateColumn } from '../lib/cases/dateColumn';
import { ACCENT_BUTTON } from '../lib/ui/chip';

export default function CaseListPage() {
  const prefersExtension = usePrefersExtensionForChat();
  const { clearAuthState } = useAuth();
  const { teams, teamsById } = useTeamSharing();
  const {
    cases,
    totalCount,
    loading,
    error,
    page,
    pageSize,
    filters,
    appliedFilters,
    setFilters,
    loadPage,
  } = useCaseList();

  /**
   * Is anything narrowing this list?
   *
   * Read from the filters themselves rather than from the row count, because
   * the two answer different questions and only this one distinguishes "you
   * have no cases" from "none match what you asked for". Every key that reaches
   * a request is listed; `search` included, since a search that matches nothing
   * is the same situation.
   */
  const isFiltered = Boolean(
    filters.state
      || filters.source
      || filters.team_id
      || filters.search
      || filters.date_from
      || filters.date_to,
  );

  /**
   * BOTH conditions, because each alone gets a real case wrong.
   *
   * `totalCount === 0` alone calls a filtered-to-nothing list a first run —
   * every predicate is in the same WHERE clause as the COUNT, so a date range
   * matching nothing reports zero for an account with forty cases.
   *
   * `!isFiltered` alone calls PAGING PAST THE END a first run: no filter is
   * set, the page is empty, and the account is full. `total_count` is what
   * distinguishes that — it stays at the true total.
   */
  const showFirstRun = totalCount === 0 && !isFiltered;

  /**
   * WHICH DATE the table's one date column shows — resolved HERE, once, and
   * handed to `CaseTable` whole (faultmaven-dashboard#155).
   *
   * The table must not sniff the filters for itself. Two consumers of one
   * question — the header and the cell — that each re-derive it from the same
   * inputs will eventually disagree, and a `Created` header over a
   * `last_activity_at` cell is precisely the lie this fixes. `CaseTabs` takes
   * its layout the same way and for the same reason.
   *
   * FROM `appliedFilters`, NOT `filters`. The column DESCRIBES the rows in
   * hand, so it has to be computed from what fetched them — the same
   * "property of the last response" distinction `searchMode` is built on. The
   * two come apart precisely when a request fails and the previous rows stay
   * on screen: an inverted range is a 422, `cases` still holds the last
   * unfiltered page, and the page renders those rows (the empty-state branch
   * needs `!error`) — so reading `filters` would head stale, unfiltered rows
   * `Created` with `created_at` cells. A rejected search is the same error
   * mirrored: `filters.search` is set while the rows are still the
   * date-filtered ones.
   */
  const dateColumn = resolveCaseDateColumn(appliedFilters);

  /**
   * Is there a date column on screen for that sentence to be about?
   *
   * `CaseTable` renders its header only when it has rows — it shows "Loading
   * cases..." or "No cases found." instead — so a note rendered unconditionally
   * told a screen-reader user "Date column: Created" straight after "No cases
   * match these filters.", naming a column that does not exist.
   *
   * KEYED ON THE ROWS, deliberately not on `!loading`. `cases` holds the
   * previous page for the whole of a refetch, so this stays true across one and
   * the text never changes — whereas clearing it while loading would empty and
   * refill the live region on every pagination click, announcing the column
   * again each time. The cost is a sub-second window during a refetch where the
   * sentence names the column the table showed a moment ago and is about to
   * show again; the benefit is that the region speaks when the answer changes
   * and stays quiet when it does not, which is the whole point of a polite one.
   */
  const dateColumnOnScreen = cases.length > 0;

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <div>
            <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">Cases</h2>
            <p className="text-fm-text-secondary text-sm">
              {totalCount} case{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
          {/* The create control lives in the NAV now — `+ New Case`, on every
              page — so this header carries the title and count only. The
              empty state keeps its own button, where it is the point of the
              page. */}
        </div>

        <CaseFiltersBar filters={filters} onChange={setFilters} teams={teams} />

        {/*
          THE SWAP, ANNOUNCED — because when it fires there is nothing focused
          to notice it.

          The column header is the carrier and it is real, visible text: a
          screen reader in table mode reads it with every cell in the column, so
          at the point of use the date is named more reliably for that user than
          for a sighted one. What the header cannot do is report the CHANGE —
          it is a `<th>` the user would have to navigate into to find.

          An earlier version of this comment said focus was "in the date input"
          at that moment. MEASURED, and it is not: `CaseFiltersBar` keys each
          date input on its own filter value, so the debounced write remounts it
          and `document.activeElement` is `<body>` by the time the column swaps.
          (Pre-existing from #154 and deliberately not fixed here.) That makes
          the region MORE necessary rather than less — focus on `<body>` leaves
          the user without even the control they just operated as an anchor, so
          nothing they can read in place says the table changed underneath them.

          `sr-only`, unlike the disabled-reason sentence in `CaseFiltersBar`,
          and the difference is whether a visible carrier already exists. That
          one had none — a `title` does not render on a disabled control and
          `sr-only` is invisible, so a sighted mouse user was left with no
          explanation anywhere. This one has the header two lines below; saying
          it again on the page would be duplicated text for everyone who can see
          it.

          The NODE is rendered unconditionally, outside the table/empty-state
          branch below, so the live region is registered once at mount rather
          than appearing and disappearing with the table — an inserted region
          arriving with content already in it is the case assistive technology
          is least consistent about. The SENTENCE is not: a stable node does not
          require stable text, and there is no date column to name unless the
          table is showing rows. The sentence is built from `dateColumn.label`,
          so it cannot name a column the header does not.
        */}
        <p role="status" className="sr-only">
          {dateColumnOnScreen ? `Date column: ${dateColumn.label}` : ''}
        </p>

        {error && (
          <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {error}
          </div>
        )}

        {!loading && !error && cases.length === 0 ? (
          /*
           * An ordinary empty state, on an ordinary page.
           *
           * This used to be a redirect to `/investigate` keyed on the rows in
           * hand, which made `/cases` unreachable for a person with no cases
           * and bounced anyone who merely paged past the end or cleared a
           * filter — `cases.length` cannot tell those apart. The first-run
           * question is asked once, at sign-in, by `resolvePostSignInLanding`.
           *
           * WHICH SENTENCE depends on whether anything is filtering, NOT on
           * `total_count`. The comment here used to say `total_count` "is the
           * whole account rather than this page of it" — true only with no
           * filters. Every predicate lives in the same WHERE clause as the
           * COUNT (deliberately: it is what keeps pagination sound), so a
           * filtered list reports the FILTERED total. A date range matching
           * nothing therefore returned `total_count: 0` and a user with forty
           * cases was told "No cases yet." over a `+ New Case` button.
           *
           * The creation-date range is the filter most likely to match nothing,
           * which is how this surfaced.
           */
          <div
            data-testid="cases-empty-state"
            className="border border-fm-border rounded-fm-card bg-fm-surface px-6 py-12 text-center"
          >
            <p className="text-fm-text-primary text-sm font-medium mb-1">
              {showFirstRun ? 'No cases yet.' : 'No cases match these filters.'}
            </p>
            <p className="text-fm-text-secondary text-sm mb-5">
              {showFirstRun
                ? prefersExtension
                  ? 'Start a new case from the Copilot and it will show up here.'
                  : 'Start a new case and it will show up here.'
                : prefersExtension
                  ? 'Clear the filters to see everything.'
                  : 'Clear the filters to see everything, or start looking at something new.'}
            </p>
            {/* ADR-018 D3's own note on D6: with the preference on, the
                first-run destination does not exist, so the empty state points
                at the Copilot rather than at a surface that would redirect
                straight back here. The RULE is unchanged — a new user starts a
                case rather than staring at an empty table — only the surface
                that honours it moves. */}
            {!prefersExtension && (
              <Link to="/investigate" className={ACCENT_BUTTON}>
                + New Case
              </Link>
            )}
          </div>
        ) : (
          <>
            <CaseTable
              cases={cases}
              loading={loading}
              teamsById={teamsById}
              dateColumn={dateColumn}
            />

            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={totalCount}
              onPageChange={(p) => loadPage(p)}
            />
          </>
        )}
      </main>
    </div>
  );
}
