import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { CaseTable } from '../components/CaseTable';
import { CaseFiltersBar } from '../components/CaseFiltersBar';
import { PaginationControls } from '../components/PaginationControls';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useCaseList } from '../hooks/useCaseList';
import { useTeamSharing } from '../hooks/useTeamSharing';
import { logoutAuth } from '../lib/api';

export default function CaseListPage() {
  const { clearAuthState } = useAuth();
  const { teams, teamsById } = useTeamSharing();
  const { cases, totalCount, loading, error, page, pageSize, filters, setFilters, loadPage, archiveById } =
    useCaseList();
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  const confirmArchive = async () => {
    if (!confirmArchiveId) return;
    try {
      setArchiveError(null);
      await archiveById(confirmArchiveId);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Failed to archive case');
    } finally {
      setConfirmArchiveId(null);
    }
  };

  const showArchived = filters.include_archived ?? false;

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">Cases</h2>
            <p className="text-fm-text-secondary text-sm">
              {totalCount} case{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-fm-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setFilters({ ...filters, include_archived: e.target.checked || undefined })}
              className="rounded border-fm-border text-fm-accent focus:ring-fm-accent"
            />
            Include archived
          </label>
        </div>

        <CaseFiltersBar filters={filters} onChange={setFilters} teams={teams} />

        {error && (
          <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {error}
          </div>
        )}

        {archiveError && (
          <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {archiveError}
          </div>
        )}

        <CaseTable
          cases={cases}
          loading={loading}
          teamsById={teamsById}
          renderActions={(c) => {
            // Archive available for terminal cases (resolved/closed) not yet archived.
            const canArchive = c.is_terminal && !c.is_archived;
            return (
              <>
                {canArchive && (
                  <button
                    onClick={() => setConfirmArchiveId(c.case_id)}
                    className="text-xs text-fm-warning/70 hover:text-fm-warning transition-colors"
                  >
                    Archive
                  </button>
                )}
                {c.is_archived && <span className="text-xs text-fm-text-tertiary">Archived</span>}
              </>
            );
          }}
        />

        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={totalCount}
          onPageChange={(p) => loadPage(p)}
        />
      </main>

      <ConfirmDialog
        isOpen={!!confirmArchiveId}
        title="Archive Case"
        message="Archive this case? It will be hidden from the default case list. You can view it again by checking 'Include archived'."
        confirmLabel="Archive"
        onConfirm={confirmArchive}
        onCancel={() => setConfirmArchiveId(null)}
      />
    </div>
  );
}
