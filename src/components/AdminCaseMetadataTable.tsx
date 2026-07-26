import { Link } from 'react-router-dom';
import { CaseStateBadge } from './CaseStateBadge';
import { MilestoneProgress } from './MilestoneProgress';
import { SourceBadge } from './SourceBadge';
import type { AdminCaseMetadata } from '../lib/api';

interface AdminCaseMetadataTableProps {
  cases: AdminCaseMetadata[];
  loading: boolean;
}

/**
 * The cloud operator's All Cases table — ambient metadata only (ADR-012 D9).
 *
 * Columns: Case ID / Owner / Organization / Status / Progress / Last Activity.
 * There is no Title and no description line, because in cloud the backend does
 * not send them: user free text is content, reachable only through the audited
 * break-glass grant (faultmaven#815).
 *
 * This is a separate component from `CaseTable` rather than a `showTitle={false}`
 * prop on it, mirroring the backend's own choice of a separate response model
 * over `CaseSummary` with `title=null`. Sharing one component would mean one
 * render path holding a row type that may or may not carry a title, and the
 * failure mode of getting that wrong is rendering a withheld title — or the
 * "Untitled Case" placeholder that misreports policy as missing data. Here a
 * `c.title` does not typecheck. The shared cells below are already shared
 * components (`CaseStateBadge`, `MilestoneProgress`, `SourceBadge`), so the two
 * tables cannot drift on how a state or a progress bar looks.
 *
 * The case id links to the detail page, which is the operator's honest next
 * step: the backend gates content there, so cloud follow-through is a 403 until
 * break-glass exists rather than a silently different view.
 */
export function AdminCaseMetadataTable({ cases, loading }: AdminCaseMetadataTableProps) {
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
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Case ID</th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Owner</th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">
                Organization
              </th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Status</th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Progress</th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">
                Last Activity
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fm-border">
            {cases.map((c) => (
              <tr key={c.case_id} className="hover:bg-fm-elevated/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/cases/${c.case_id}`}
                      className="font-mono text-xs font-medium text-fm-text-primary hover:text-fm-accent transition-colors"
                    >
                      {c.case_id}
                    </Link>
                    <SourceBadge source={c.source} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-fm-text-secondary">{c.user_id}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-fm-text-secondary">
                    {c.organization_id}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <CaseStateBadge state={c.state} />
                </td>
                <td className="px-4 py-3">
                  <MilestoneProgress
                    completed={c.milestones_completed}
                    total={c.total_milestones}
                  />
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
  );
}
