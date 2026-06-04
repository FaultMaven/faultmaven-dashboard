import type { CaseDetail } from '../types/cases';

interface ResolutionNotesProps {
  notes: string;
  onChange: (notes: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  error: string | null;
  disabled: boolean;
}

interface IssueTabProps {
  caseDetail: CaseDetail;
  resolutionNotes?: ResolutionNotesProps;
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

export function IssueTab({ caseDetail, resolutionNotes }: IssueTabProps) {
  const milestones = caseDetail.milestones_completed || [];
  const hasRootCause = milestones.includes('root_cause_identified');
  const hasSolution = milestones.includes('solution_verified');

  return (
    <div className="py-1 space-y-4">
      {/* Problem Statement */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1">
          Problem Statement
        </h3>
        <p className="text-sm text-fm-text-primary">
          {caseDetail.description || 'No problem statement recorded.'}
        </p>
      </section>

      {/* Resolution Timeline */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1">
          Resolution
        </h3>
        <div className="flex items-center gap-4 text-sm text-fm-text-secondary">
          <div>
            <span className="text-fm-text-tertiary">Status: </span>
            <span className="text-fm-success font-medium capitalize">{caseDetail.state}</span>
          </div>
          {caseDetail.resolved_at && (
            <div>
              <span className="text-fm-text-tertiary">Time to resolve: </span>
              <DurationDisplay createdAt={caseDetail.created_at} resolvedAt={caseDetail.resolved_at} />
            </div>
          )}
          <div>
            <span className="text-fm-text-tertiary">Turns: </span>
            <span>{caseDetail.current_turn}</span>
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

      {/* Resolution Notes */}
      {resolutionNotes && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1">
            Resolution Notes
          </h3>
          <textarea
            value={resolutionNotes.notes}
            onChange={(e) => resolutionNotes.onChange(e.target.value)}
            className="w-full px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent resize-y min-h-[80px]"
            placeholder="Add resolution notes, root cause findings, or follow-up actions..."
            disabled={resolutionNotes.disabled}
          />
          {resolutionNotes.error && (
            <p className="text-fm-critical text-xs mt-1">{resolutionNotes.error}</p>
          )}
          {!resolutionNotes.disabled && (
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={resolutionNotes.onSave}
                disabled={resolutionNotes.saving}
                className="px-3 py-1.5 text-xs font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
              >
                {resolutionNotes.saving ? 'Saving...' : 'Save Notes'}
              </button>
              {resolutionNotes.saved && (
                <span className="text-fm-success text-xs">Saved</span>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
