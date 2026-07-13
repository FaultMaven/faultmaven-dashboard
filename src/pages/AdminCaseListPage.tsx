import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { CaseTable } from '../components/CaseTable';
import { CaseFiltersBar } from '../components/CaseFiltersBar';
import { PaginationControls } from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { getAdminCases, logoutAuth } from '../lib/api';
import type { CaseSummary, CaseFilters, CaseSource } from '../lib/api';

const PAGE_SIZE = 20;

const SOURCE_OPTIONS: { value: CaseSource | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'copilot', label: 'Copilot' },
  { value: 'slack', label: 'Slack' },
];

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
  // Monotonic request id: only the latest in-flight load may apply its result,
  // so rapid filter/page changes can't render stale results.
  const reqIdRef = useRef(0);

  const loadPage = useCallback(
    async (nextPage: number, activeFilters: CaseFilters) => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await getAdminCases(activeFilters, nextPage, PAGE_SIZE);
        if (reqId !== reqIdRef.current) return; // superseded by a newer load
        setCases(res.cases);
        setTotalCount(res.total_count);
        setPage(nextPage);
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load cases');
        setCases([]);
        setTotalCount(0);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
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

        {/* The admin endpoint filters by state only — hide date/search controls. */}
        <CaseFiltersBar filters={filters} onChange={setFilters} stateOnly />

        {/* Source filter (ADR-012): tell Copilot and Slack cases apart. */}
        <div className="mb-4 flex items-center gap-1.5">
          <span className="text-sm text-fm-text-tertiary mr-1">Source</span>
          {SOURCE_OPTIONS.map(({ value, label }) => {
            const active = filters.source === value;
            return (
              <button
                key={label}
                onClick={() => setFilters({ ...filters, source: value })}
                className={`px-3 py-1 text-sm font-medium rounded-full border transition-colors ${
                  active
                    ? 'bg-fm-accent text-white border-fm-accent'
                    : 'text-fm-text-secondary border-fm-border hover:bg-fm-elevated'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {error}
          </div>
        )}

        <CaseTable cases={cases} loading={loading} showOwner />

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
