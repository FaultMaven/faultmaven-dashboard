import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { CaseStateBadge } from '../components/CaseStateBadge';
import { MilestoneProgress } from '../components/MilestoneProgress';
import { CaseFiltersBar } from '../components/CaseFiltersBar';
import { PaginationControls } from '../components/PaginationControls';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useCaseList } from '../hooks/useCaseList';
import { logoutAuth } from '../lib/api';

export default function CaseListPage() {
  const { clearAuthState } = useAuth();
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

        <CaseFiltersBar filters={filters} onChange={setFilters} />

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
                  <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Progress</th>
                  <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Last Activity</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fm-border">
                {cases.map((c) => {
                  // Archive available for terminal cases (resolved/closed) that aren't already archived
                  const canArchive = c.is_terminal && !c.is_archived;

                  return (
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
                        <CaseStateBadge state={c.state} />
                      </td>
                      <td className="px-4 py-3">
                        <MilestoneProgress completed={c.milestones_completed} total={c.total_milestones} />
                      </td>
                      <td className="px-4 py-3 text-fm-text-tertiary">
                        {new Date(c.last_activity_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canArchive && (
                          <button
                            onClick={() => setConfirmArchiveId(c.case_id)}
                            className="text-xs text-fm-warning/70 hover:text-fm-warning transition-colors"
                          >
                            Archive
                          </button>
                        )}
                        {c.is_archived && (
                          <span className="text-xs text-fm-text-tertiary">Archived</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

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
