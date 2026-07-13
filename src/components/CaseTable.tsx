import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CaseStateBadge } from './CaseStateBadge';
import { MilestoneProgress } from './MilestoneProgress';
import { SourceBadge } from './SourceBadge';
import type { CaseSummary } from '../lib/api';

interface CaseTableProps {
  cases: CaseSummary[];
  loading: boolean;
  /** Show an Owner column (the case's `user_id`) — used by the admin view. */
  showOwner?: boolean;
  /** Optional trailing action cell per row (e.g. the Archive control). */
  renderActions?: (c: CaseSummary) => ReactNode;
}

/**
 * Shared case list table (Title / [Owner] / Status / Progress / Last Activity /
 * [actions]). Used by both the per-user `CaseListPage` and the cross-tenant
 * `AdminCaseListPage` so the two never drift.
 */
export function CaseTable({ cases, loading, showOwner = false, renderActions }: CaseTableProps) {
  return (
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
              {showOwner && (
                <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Owner</th>
              )}
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Status</th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Progress</th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Last Activity</th>
              {renderActions && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-fm-border">
            {cases.map((c) => (
              <tr key={c.case_id} className="hover:bg-fm-elevated/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/cases/${c.case_id}`}
                      className="font-medium text-fm-text-primary hover:text-fm-accent transition-colors"
                    >
                      {c.title || 'Untitled Case'}
                    </Link>
                    <SourceBadge source={c.source} />
                  </div>
                  {c.description && (
                    <p className="text-xs text-fm-text-tertiary mt-0.5 line-clamp-1">{c.description}</p>
                  )}
                </td>
                {showOwner && (
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-fm-text-secondary">{c.user_id}</span>
                  </td>
                )}
                <td className="px-4 py-3">
                  <CaseStateBadge state={c.state} />
                </td>
                <td className="px-4 py-3">
                  <MilestoneProgress completed={c.milestones_completed} total={c.total_milestones} />
                </td>
                <td className="px-4 py-3 text-fm-text-tertiary">
                  {new Date(c.last_activity_at).toLocaleDateString()}
                </td>
                {renderActions && <td className="px-4 py-3 text-right">{renderActions(c)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
