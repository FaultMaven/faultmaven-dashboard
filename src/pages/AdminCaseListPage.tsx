import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { CaseStateBadge } from '../components/CaseStateBadge';
import { MilestoneProgress } from '../components/MilestoneProgress';
import { CaseFiltersBar } from '../components/CaseFiltersBar';
import { PaginationControls } from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { getAdminCases, logoutAuth } from '../lib/api';
import type { CaseSummary, CaseFilters } from '../lib/api';

const PAGE_SIZE = 20;

/**
 * Platform-admin cross-tenant case list (ADR-012 D9) — every user's cases on
 * this server (Copilot- and Slack-agent-originated) in one place. Reachable
 * only for a standalone admin (see `canViewAllCases`); the backend enforces the
 * same and returns 403 in cloud until an audited break-glass path exists.
 */
export default function AdminCaseListPage() {
  const { clearAuthState } = useAuth();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<CaseFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (nextPage: number, activeFilters: CaseFilters) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAdminCases(activeFilters, nextPage, PAGE_SIZE);
        setCases(res.cases);
        setTotalCount(res.total_count);
        setPage(nextPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load cases');
        setCases([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadPage(0, filters);
  }, [filters, loadPage]);

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">All Cases</h2>
          <p className="text-fm-text-secondary text-sm">
            Every user&apos;s cases on this server — {totalCount} case{totalCount !== 1 ? 's' : ''} (admin view)
          </p>
        </div>

        <CaseFiltersBar filters={filters} onChange={setFilters} />

        {error && (
          <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {error}
          </div>
        )}

        <div className="bg-fm-surface rounded-fm-card border border-fm-border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-fm-text-tertiary text-sm">Loading cases...</div>
          ) : cases.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-fm-text-tertiary text-sm">No cases found.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-fm-elevated border-b border-fm-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Owner</th>
                  <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Progress</th>
                  <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fm-border">
                {cases.map((c) => (
                  <tr key={c.case_id} className="hover:bg-fm-elevated/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/cases/${c.case_id}`}
                        className="font-medium text-fm-text-primary hover:text-fm-accent transition-colors"
                      >
                        {c.title || 'Untitled Case'}
                      </Link>
                      {c.description && (
                        <p className="text-xs text-fm-text-tertiary mt-0.5 line-clamp-1">{c.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-fm-text-secondary">{c.user_id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <CaseStateBadge state={c.state} />
                    </td>
                    <td className="px-4 py-3">
                      <MilestoneProgress completed={c.milestones_completed} total={c.total_milestones} />
                    </td>
                    <td className="px-4 py-3 text-fm-text-tertiary">
                      {new Date(c.last_activity_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <PaginationControls
          page={page}
          pageSize={PAGE_SIZE}
          total={totalCount}
          onPageChange={(p) => loadPage(p, filters)}
        />
      </main>
    </div>
  );
}
