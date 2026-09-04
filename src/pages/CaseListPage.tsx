import { Link, Navigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { CaseTable } from '../components/CaseTable';
import { CaseFiltersBar } from '../components/CaseFiltersBar';
import { PaginationControls } from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { useCaseList } from '../hooks/useCaseList';
import { useTeamSharing } from '../hooks/useTeamSharing';
import { logoutAuth } from '../lib/api';
import { isUnfiltered } from '../lib/cases/filters';

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

  // ADR-016 D6: a signed-in person with no cases lands on the panel with a new
  // investigation open, not on an empty list. The list is not a useful place to
  // arrive with nothing in it — before this, it rendered a table with no rows
  // and no empty state at all. `error` guards the redirect: a failed load also
  // leaves `cases` empty, and bouncing someone away from the error would hide
  // the reason their cases are missing.
  if (!loading && !error && cases.length === 0 && isUnfiltered(filters)) {
    return <Navigate to="/investigate" replace />;
  }

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
          <Link
            to="/investigate"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-fm-btn bg-fm-accent-soft text-fm-accent border border-fm-accent-border hover:bg-fm-accent-hover transition-colors"
          >
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
          <div
            data-testid="cases-empty-state"
            className="border border-fm-border rounded-fm-card bg-fm-surface px-6 py-12 text-center"
          >
            <p className="text-fm-text-primary text-sm font-medium mb-1">
              No cases match these filters.
            </p>
            <p className="text-fm-text-secondary text-sm mb-5">
              Clear the filters to see everything, or start looking at something new.
            </p>
            <Link
              to="/investigate"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-fm-btn bg-fm-accent-soft text-fm-accent border border-fm-accent-border hover:bg-fm-accent-hover transition-colors"
            >
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
