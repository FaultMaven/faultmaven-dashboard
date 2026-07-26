import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { CaseTable } from '../components/CaseTable';
import { AdminCaseMetadataTable } from '../components/AdminCaseMetadataTable';
import { CaseFiltersBar } from '../components/CaseFiltersBar';
import { PaginationControls } from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { getAdminCases, logoutAuth } from '../lib/api';
import { chipBase, chipActive, chipInactive } from '../lib/ui/chip';
import type { AdminCaseListResult, CaseFilters, CaseSource } from '../lib/api';

const PAGE_SIZE = 20;

const SOURCE_OPTIONS: { value: CaseSource | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'copilot', label: 'Copilot' },
  { value: 'slack', label: 'Slack' },
];

/**
 * Platform-admin cross-tenant case list (ADR-012 D9) — every user's cases on
 * this server (Copilot- and Slack-agent-originated) in one place. Reachable for
 * a `platform_admin` in either deployment (see `canViewAllCases`); the backend
 * enforces the same role.
 *
 * What a row contains is the deployment split, and it is read off the RESPONSE,
 * not off this app's notion of the deployment mode. `GET /api/v1/admin/cases`
 * returns a union discriminated on `view`: `"full"` (standalone) carries titles,
 * `"metadata"` (cloud) carries ambient metadata only, because a title is user
 * free text and therefore content — reachable through the audited break-glass
 * grant (faultmaven#815), not from an ambient list. Narrowing on `view` is what
 * keeps the rendered columns and the served policy from drifting apart.
 */
export default function AdminCaseListPage() {
  const { clearAuthState } = useAuth();
  const [result, setResult] = useState<AdminCaseListResult | null>(null);
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
        setResult(res);
        setTotalCount(res.total_count);
        setPage(nextPage);
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load cases');
        // Drop the previous page rather than leave it on screen under an error
        // banner — and see the render below, which shows the message INSTEAD of
        // a table. The endpoint refuses (403) under multi-tenant cloud because
        // row-level security would make the list silently partial; an empty
        // table there would read as "no cases exist", which is the specific
        // wrong answer that refusal exists to prevent.
        setResult(null);
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

  const metadataOnly = result?.view === 'metadata';

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">All Cases</h2>
          <p className="text-fm-text-secondary text-sm">
            Every user&apos;s cases on this server — {totalCount} case
            {totalCount !== 1 ? 's' : ''} (admin view)
          </p>
          {metadataOnly && (
            <p className="text-fm-text-tertiary text-xs mt-1">
              Metadata only — case titles and content are withheld from this view and require an
              audited break-glass grant.
            </p>
          )}
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
                className={`${chipBase} ${active ? chipActive : chipInactive}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {error}
          </div>
        ) : result?.view === 'metadata' ? (
          <AdminCaseMetadataTable cases={result.cases} loading={loading} />
        ) : (
          <CaseTable cases={result?.cases ?? []} loading={loading} showOwner />
        )}

        {!error && (
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={totalCount}
            onPageChange={(p) => loadPage(p, filters)}
          />
        )}
      </main>
    </div>
  );
}
