import { useEffect, useState } from 'react';
import type { CaseDetail, ProblemVerification } from '../types/cases';
import { getCaseUI } from '../lib/api';
import { closureReasonDisplay } from '../lib/cases/closureReason';
import { problemStatementView } from '../lib/cases/problemStatus';
import { caseTurnCount } from '../lib/cases/turnLabel';

interface IssueTabProps {
  caseDetail: CaseDetail;
}

function DurationDisplay({ createdAt, resolvedAt }: { createdAt: string; resolvedAt: string | null }) {
  if (!resolvedAt) return null;
  const ms = new Date(resolvedAt).getTime() - new Date(createdAt).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return <span>{minutes}m</span>;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return <span>{hours}h {minutes % 60}m</span>;
  const days = Math.floor(hours / 24);
  return <span>{days}d {hours % 24}h</span>;
}

interface JudgedStatement {
  statement: string;
  verification: ProblemVerification | null;
}

/**
 * The statement the server judged and its verification, for an INVESTIGATING
 * case: `GET /cases/{id}` carries neither, so this reads the case's UI view, as
 * the Hypotheses tab does. RESOLVED and CLOSED responses carry no
 * verification. A failed read leaves the tab on `description`, as before.
 */
function useJudgedStatement(caseId: string, investigating: boolean): JudgedStatement | null {
  // Keyed by case, so a result read for one case is never shown on another.
  const [read, setRead] = useState<{ caseId: string; judged: JudgedStatement } | null>(null);
  useEffect(() => {
    if (!investigating) return;
    let cancelled = false;
    getCaseUI(caseId)
      .then((ui) => {
        const statement = ui.problem_statement?.trim();
        if (!cancelled && statement) {
          setRead({ caseId, judged: { statement, verification: ui.problem_verification ?? null } });
        }
      })
      .catch(() => {
        // The tab still renders the case's description; nothing to surface.
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, investigating]);
  return investigating && read?.caseId === caseId ? read.judged : null;
}

export function IssueTab({ caseDetail }: IssueTabProps) {
  const judged = useJudgedStatement(caseDetail.case_id, caseDetail.state === 'investigating');
  // The verification judges the statement in the same response; the case's
  // description is shown without one.
  const problem = judged
    ? problemStatementView(judged.statement, judged.verification)
    : null;
  const milestones = caseDetail.milestones_completed || [];
  const hasRootCause = milestones.includes('root_cause_identified');
  const hasSolution = milestones.includes('solution_verified');

  // Only a genuinely resolved case earns success-green. `closed` is terminal
  // but not necessarily resolved (e.g. abandoned/duplicate), and the active
  // states aren't outcomes at all — so those read neutral, not green.
  const stateColor =
    caseDetail.state === 'resolved' ? 'text-fm-success font-medium' : 'text-fm-text-primary font-medium';

  return (
    <div className="py-1 space-y-4">
      {/* Problem Statement */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1">
          Problem Statement
        </h3>
        {problem ? (
          <>
            <p
              className={`text-sm ${problem.struck ? 'line-through text-fm-text-tertiary' : 'text-fm-text-primary'}`}
            >
              {problem.statement}
            </p>
            {problem.notes.map((note) => (
              <p
                key={note.text}
                className={`text-xs mt-0.5 ${note.tone === 'warning' ? 'text-fm-warning' : 'text-fm-text-tertiary'}`}
              >
                {note.text}
              </p>
            ))}
          </>
        ) : (
          <p className="text-sm text-fm-text-primary">
            {caseDetail.description || 'No problem statement recorded.'}
          </p>
        )}
      </section>

      {/* Resolution Timeline */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1">
          Resolution
        </h3>
        <div className="flex items-center gap-4 text-sm text-fm-text-secondary">
          <div>
            <span className="text-fm-text-tertiary">Status: </span>
            <span className={`capitalize ${stateColor}`}>{caseDetail.state}</span>
          </div>
          {caseDetail.resolved_at && (
            <div>
              <span className="text-fm-text-tertiary">Time to resolve: </span>
              <DurationDisplay createdAt={caseDetail.created_at} resolvedAt={caseDetail.resolved_at} />
            </div>
          )}
          <div>
            <span className="text-fm-text-tertiary">Turns: </span>
            <span>{caseTurnCount(caseDetail)}</span>
          </div>
        </div>
      </section>

      {/* Milestones */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1">
          Investigation Milestones
        </h3>
        {milestones.length === 0 ? (
          <p className="text-sm text-fm-text-tertiary">No milestones recorded.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {milestones.map((m) => (
              <span
                key={m}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-fm-success/10 text-fm-success border border-fm-success/20"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {m.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Key Findings */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1">
          Key Findings
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex gap-2">
            <span className="text-fm-text-tertiary shrink-0 w-28">Root cause:</span>
            <span className={hasRootCause ? 'text-fm-text-primary' : 'text-fm-text-tertiary'}>
              {hasRootCause ? 'Identified' : 'Not identified'}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-fm-text-tertiary shrink-0 w-28">Solution:</span>
            <span className={hasSolution ? 'text-fm-text-primary' : 'text-fm-text-tertiary'}>
              {hasSolution ? 'Verified' : 'Not verified'}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-fm-text-tertiary shrink-0 w-28">Hypotheses:</span>
            <span className="text-fm-text-primary">
              {caseDetail.hypothesis_count} generated
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-fm-text-tertiary shrink-0 w-28">Evidence:</span>
            <span className="text-fm-text-primary">
              {caseDetail.evidence_count} item{caseDetail.evidence_count !== 1 ? 's' : ''}
            </span>
          </div>
          {caseDetail.solution_count > 0 && (
            <div className="flex gap-2">
              <span className="text-fm-text-tertiary shrink-0 w-28">Solutions:</span>
              <span className="text-fm-text-primary">
                {caseDetail.solution_count} proposed
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Closure Reason — read-only display of the engine-derived
          classification. Cases are authored/mutated only in the Copilot (D1);
          the Dashboard views them.

          It was headed "Resolution Notes" and rendered raw, which presented a
          key like `closed_insufficient_evidence` as if it were a sentence
          someone wrote — and promised resolution notes on a field that is only
          ever set for CLOSED cases (RESOLVED carries null). */}
      {caseDetail.closure_reason && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1">
            Closure Reason
          </h3>
          <p className="text-sm text-fm-text-primary">
            {closureReasonDisplay(caseDetail.closure_reason).label}
          </p>
          <p className="text-sm text-fm-text-secondary">
            {closureReasonDisplay(caseDetail.closure_reason).description}
          </p>
        </section>
      )}
    </div>
  );
}
