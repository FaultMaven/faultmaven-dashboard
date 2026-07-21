import { PageHeader } from '../components/PageHeader';
import { CaseTable } from '../components/CaseTable';
import { CaseFiltersBar } from '../components/CaseFiltersBar';
import { PaginationControls } from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { useCaseList } from '../hooks/useCaseList';
import { useTeamSharing } from '../hooks/useTeamSharing';
import { logoutAuth } from '../lib/api';

export default function CaseListPage() {
  const { clearAuthState } = useAuth();
  const { teams, teamsById } = useTeamSharing();
  const { cases, totalCount, loading, error, page, pageSize, filters, setFilters, loadPage } =
    useCaseList();

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">Cases</h2>
          <p className="text-fm-text-secondary text-sm">
            {totalCount} case{totalCount !== 1 ? 's' : ''}
          </p>
        </div>

        <CaseFiltersBar filters={filters} onChange={setFilters} teams={teams} />

        {error && (
          <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {error}
          </div>
        )}

        <CaseTable cases={cases} loading={loading} teamsById={teamsById} />

        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={totalCount}
          onPageChange={(p) => loadPage(p)}
        />
      </main>
    </div>
  );
}
