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
 * Columns: Case ID / Owner / Status / Progress / Last Activity. There is no
 * Title and no description line, because in cloud the backend does not send
 * them: user free text is content, reachable only through the audited
 * break-glass grant (faultmaven#815).
 *
 * No Organization column either, despite `organization_id` being on the row.
 * It would be constant in every configuration that can reach this table: under
 * `TENANT_PROVIDER=single` (what cloud runs today) every case carries the
 * Standalone org, and under `multi` the endpoint 403s rather than serve a list
 * RLS has silently narrowed to one tenant. A column with one value everywhere
 * implies a discrimination between tenants that this view cannot actually make.
 * It belongs with the bounded cross-tenant read in faultmaven#815, which is
 * what first makes org vary here.
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
 * The case id is deliberately NOT a link to the detail page. `GET /cases/{id}`
 * is scoped to cases the caller owns or has shared to a team — there is no
 * operator bypass — so for a cloud operator every row would land on 404 "Case
 * not found or access denied", reporting a case they are looking at in this very
 * list as nonexistent. That is the same class of wrong answer the backend's
 * multi-tenant refusal exists to avoid. The id is selectable instead (the
 * convention `CaseDetailPage` already uses for case ids), and the real
 * open-content affordance arrives with the audited break-glass path
 * (faultmaven#815 + faultmaven-dashboard#62).
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
                    <span className="font-mono text-xs font-medium text-fm-text-primary select-all">
                      {c.case_id}
                    </span>
                    <SourceBadge source={c.source} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-fm-text-secondary">{c.user_id}</span>
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
