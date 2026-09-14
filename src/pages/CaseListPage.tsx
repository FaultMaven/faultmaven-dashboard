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
            <CaseTable cases={cases} loading={loading} teamsById={teamsById} />

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
