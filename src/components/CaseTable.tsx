import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CaseStateBadge } from './CaseStateBadge';
import { CaseStageCell } from './CaseStageCell';
import { SourceBadge } from './SourceBadge';
import { TeamShareBadge } from './TeamShareBadge';
import type { CaseSummary } from '../lib/api';
import { LAST_ACTIVITY_COLUMN, type CaseDateColumn } from '../lib/cases/dateColumn';

interface CaseTableProps {
  cases: CaseSummary[];
  loading: boolean;
  /** Show an Owner column (the case's `user_id`) — used by the admin view. */
  showOwner?: boolean;
  /** Optional trailing action cell per row (e.g. the Archive control). */
  renderActions?: (c: CaseSummary) => ReactNode;
  /** team_id → name for the team-share badge (ADR-013 §D4). Omit where team
   *  sharing is off; the badge then renders nothing (cases carry no team ids). */
  teamsById?: Map<string, string>;
  /**
   * Where a title links. Defaults to the owner's case page.
   *
   * The operator All Cases view overrides it, because `GET /cases/{id}` gates on
   * owner ∪ shared-to-my-teams with no operator arm — so on that view every row
   * the operator does not own would 404 (faultmaven#846). It points at the
   * audited operator route instead.
   */
  caseHref?: (c: CaseSummary) => string;

  /**
   * WHICH DATE the single date column shows, header and cell together.
   *
   * Resolved by the page (`resolveCaseDateColumn`) and handed down whole, never
   * sniffed from the filters here — the same rule `CaseTabs` follows with
   * `CaseConversationLayout`. One value carries both halves precisely so this
   * component cannot put a `Created` header over a `last_activity_at` cell,
   * which is the lie faultmaven-dashboard#155 exists to stop.
   *
   * Defaults to last activity: that is what every surface without a
   * creation-date filter shows, the operator All Cases list included.
   */
  dateColumn?: CaseDateColumn;
}

/**
 * Shared case list table (Title / [Owner] / State / Stage / date / [actions]).
 * Used by both the per-user `CaseListPage` and the cross-tenant
 * `AdminCaseListPage` so the two never drift.
 *
 * ONE date column, and `dateColumn` says which date it is — Last Activity
 * normally, Created while a creation-date filter is narrowing the list
 * (faultmaven-dashboard#155). A seventh column was the alternative and it is
 * width the table does not have.
 *
 * This is the **content-bearing** table: every row carries a title. The cloud
 * operator list has no titles to show (ADR-012 D9) and uses the separate
 * `AdminCaseMetadataTable` — deliberately not a `showTitle={false}` prop here,
 * so no render path can ever hold a row whose title may or may not exist.
 */
export function CaseTable({
  cases,
  loading,
  showOwner = false,
  renderActions,
  teamsById,
  caseHref = (c) => `/cases/${c.case_id}`,
  dateColumn = LAST_ACTIVITY_COLUMN,
}: CaseTableProps) {
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
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">State</th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Stage</th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">
                {dateColumn.label}
              </th>
              {renderActions && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-fm-border">
            {cases.map((c) => (
              <tr key={c.case_id} className="hover:bg-fm-elevated/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      to={caseHref(c)}
                      className="font-medium text-fm-text-primary hover:text-fm-accent transition-colors"
                    >
                      {c.title || 'Untitled Case'}
                    </Link>
                    <SourceBadge source={c.source} />
                    <TeamShareBadge teamIds={c.shared_team_ids} teamsById={teamsById} />
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
                  <CaseStageCell
                    state={c.state}
                    stage={c.stage}
                    turnsWithoutProgress={c.turns_without_progress}
                  />
                </td>
                {/* The SAME `dateColumn` the header above read, so the two
                    cannot name different dates. Formatting is unchanged:
                    `toLocaleDateString()` in the viewer's own timezone, with no
                    guard — both keys are required on `CaseSummary`. */}
                <td className="px-4 py-3 text-fm-text-tertiary">
                  {new Date(c[dateColumn.field]).toLocaleDateString()}
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
