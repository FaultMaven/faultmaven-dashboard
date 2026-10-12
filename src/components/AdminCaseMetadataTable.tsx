import { Link } from 'react-router-dom';
import { CaseStateBadge } from './CaseStateBadge';
import { CaseStageCell } from './CaseStageCell';
import { SourceBadge } from './SourceBadge';
import { CasePersonName } from './CasePersonName';
import type { AdminCaseMetadata } from '../lib/api';

interface AdminCaseMetadataTableProps {
  cases: AdminCaseMetadata[];
  loading: boolean;
  /** The signed-in operator, so their OWN cases open at the full case page. */
  currentUserId?: string | null;
}

/**
 * The cloud operator's All Cases table — ambient metadata only (ADR-012 D9).
 *
 * Columns: Case ID / Owner / Driver / Enterprise / State / Stage / Last Activity. There is no
 * Title and no description line, because in cloud the backend does not send
 * them: user free text is content, reachable only through the audited
 * break-glass grant (faultmaven#815).
 *
 * The ENTERPRISE (`enterprise_id`, the isolation tenant — ADR-017 D1) gets a
 * column. Under `TENANT_PROVIDER=multi` this list spans every enterprise
 * (contract 9.1.0), so which tenant a case belongs to is the first thing an
 * operator needs to read off a row. It is shown whole, as selectable text:
 * enterprise ids can share a prefix (the Standalone enterprise is
 * `00000000-…-000000000002`), so a shortened id could make two tenants look
 * like one, and a hover-only full id is out of reach for keyboard, touch and
 * screen-reader users.
 *
 * The DRIVER (`driver_id`, contract 13.4.0) is the EFFECTIVE driver (ADR-020
 * D5): the creator unless the case was handed on. Like Owner it is an id,
 * never a name — ADR-012 D9 classes display names with titles, as text a user
 * typed, so the operator row carries none — and it is shown whole and
 * selectable, because an operator copies it to look the account up in
 * `/admin/users`. Its two non-id values are told apart:
 *
 * - `null` — the server answered and knows nobody: neither the creator nor any
 *   driver account exists any more. A muted dash, spoken "Unknown".
 * - key ABSENT — a core older than 13.4.0, which does not send the field on
 *   this row: "not reported". This deliberately does NOT go through
 *   `effectiveDriverId` / `driverLabel`, whose absent-means-creator rule is
 *   right for `CaseSummary` (absent there means a core older than 13.2.0, when
 *   only the creator wrote) and wrong here: a 13.2/13.3 core already hands
 *   cases on but omits the driver from this row, so reading absent as the
 *   creator would name the wrong account for every handed-on case.
 *
 * The billing `organization_id` gets no column at all, and for a different
 * reason: it is nullable and is null for every account nobody pays for
 * (ADR-017 D5), so a column for it would be blank down the page — and it
 * answers a question nobody asks of an operator case list, since who pays for
 * an account decides nothing about whose data this row is.
 *
 * This is a separate component from `CaseTable` rather than a `showTitle={false}`
 * prop on it, mirroring the backend's own choice of a separate response model
 * over `CaseSummary` with `title=null`. Sharing one component would mean one
 * render path holding a row type that may or may not carry a title, and the
 * failure mode of getting that wrong is rendering a withheld title — or the
 * "Untitled Case" placeholder that misreports policy as missing data. Here a
 * `c.title` does not typecheck. The shared cells below are already shared
 * components (`CaseStateBadge`, `CaseStageCell`, `SourceBadge`), so the two
 * tables cannot drift on how a state or a stage looks.
 *
 * Where a row opens depends on whether the operator OWNS it. Since the list
 * spans every enterprise, the operator's own cases appear here too, and those
 * open at `/cases/{id}` — the full case page; routing them through break-glass
 * would demand a grant for the operator's own data and write an access-audit
 * row each time. Everyone else's open at `/admin/cases/{id}`: `/cases/{id}` is
 * scoped to cases the caller owns or has shared to a team, with no operator
 * bypass, so it would land on 404 "Case not found or access denied" for a case
 * listed right here (faultmaven#846). The operator route is the audited
 * break-glass path (faultmaven#815): in cloud it refuses until a live grant
 * covers the case, and the refusal explains itself. The case id stays
 * selectable text; opening is a separate, explicit action, because reading a
 * tenant's content should not be something a stray click does.
 *
 * The ENTERPRISE travels with the link (`?enterprise=`). Requesting a grant
 * needs it — `BreakGlassGrantRequest.enterprise_id` — and under multi-tenant
 * cloud it cannot be read from the case, which is exactly what the grant
 * unlocks, so it has to come from the row.
 */
export function AdminCaseMetadataTable({ cases, loading, currentUserId }: AdminCaseMetadataTableProps) {
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
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Driver</th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Enterprise</th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">State</th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">Stage</th>
              <th className="text-left px-4 py-3 font-medium text-fm-text-secondary">
                Last Activity
              </th>
              <th className="px-4 py-3"></th>
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
                  <span className="font-mono text-xs text-fm-text-secondary select-all break-all">
                    {c.user_id}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <DriverIdCell driverId={c.driver_id} />
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-fm-text-secondary select-all break-all">
                    {c.enterprise_id}
                  </span>
                </td>
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
                <td className="px-4 py-3 text-fm-text-tertiary">
                  {new Date(c.last_activity_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {currentUserId && c.user_id === currentUserId ? (
                    <Link
                      to={`/cases/${c.case_id}`}
                      className="text-fm-accent hover:underline whitespace-nowrap"
                    >
                      Open
                    </Link>
                  ) : (
                    <Link
                      to={`/admin/cases/${c.case_id}?enterprise=${encodeURIComponent(c.enterprise_id)}`}
                      className="text-fm-accent hover:underline whitespace-nowrap"
                    >
                      Open content
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * The Driver cell: the whole id, `null` as Unknown, an absent key as "not
 * reported" (a core older than contract 13.4.0). See the table's docstring for
 * why absent is not read as the creator here.
 */
function DriverIdCell({ driverId }: { driverId: string | null | undefined }) {
  if (driverId === undefined) {
    return <span className="text-fm-text-tertiary">not reported</span>;
  }
  if (driverId === null) {
    return <CasePersonName label={null} />;
  }
  return (
    <span className="font-mono text-xs text-fm-text-secondary select-all break-all">
      {driverId}
    </span>
  );
}
