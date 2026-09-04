import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { CaseTable } from '../components/CaseTable';
import { CaseFiltersBar } from '../components/CaseFiltersBar';
import { PaginationControls } from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { useCaseList } from '../hooks/useCaseList';
import { useTeamSharing } from '../hooks/useTeamSharing';
import { logoutAuth } from '../lib/api';
import { ACCENT_BUTTON } from '../lib/ui/chip';

export default function CaseListPage() {
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

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">Cases</h2>
            <p className="text-fm-text-secondary text-sm">
              {totalCount} case{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
          <Link to="/investigate" className={ACCENT_BUTTON}>
            New investigation
          </Link>
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
           * The wording follows `total_count`, which is the whole account
           * rather than this page of it.
           */
          <div
            data-testid="cases-empty-state"
            className="border border-fm-border rounded-fm-card bg-fm-surface px-6 py-12 text-center"
          >
            <p className="text-fm-text-primary text-sm font-medium mb-1">
              {totalCount === 0 ? 'No cases yet.' : 'No cases match these filters.'}
            </p>
            <p className="text-fm-text-secondary text-sm mb-5">
              {totalCount === 0
                ? 'Start an investigation and it will show up here.'
                : 'Clear the filters to see everything, or start looking at something new.'}
            </p>
            <Link to="/investigate" className={ACCENT_BUTTON}>
              Start an investigation
            </Link>
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
