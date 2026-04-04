import type { ConversionResponse, ConversionDraft } from '../lib/knowledge/conversion';

interface ConversionResultsProps {
  conversion: ConversionResponse;
  onEdit: (draft: ConversionDraft) => void;
  onVerify: (draft: ConversionDraft) => void;
  onDelete: (draft: ConversionDraft) => void;
  onBack: () => void;
}

const gradeColor: Record<string, string> = {
  A: 'text-fm-success',
  B: 'text-fm-success',
  C: 'text-fm-warning',
  D: 'text-fm-warning',
  F: 'text-fm-critical',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ConversionResults({ conversion, onEdit, onVerify, onDelete, onBack }: ConversionResultsProps) {
  const { source_file, analysis, drafts, warnings, status } = conversion;
  const isFileScan = analysis.source_assessment.content_type === 'file_scan';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-fm-text-tertiary hover:text-fm-text-primary transition-colors"
          aria-label="Back"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          {isFileScan ? (
            <h3 className="text-lg font-semibold text-fm-text-primary">
              Runbook Draft
            </h3>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-fm-text-primary">
                Conversion Complete: {drafts.length} runbook{drafts.length !== 1 ? 's' : ''} generated
              </h3>
              <p className="text-sm text-fm-text-secondary">
                Source: {source_file.filename} ({formatBytes(source_file.size_bytes)})
                {analysis.source_assessment.actionability_rating &&
                  analysis.source_assessment.actionability_rating !== 'unknown' && (
                  <> &middot; {analysis.source_assessment.actionability_rating} actionability</>
                )}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="text-sm text-fm-warning bg-fm-warning-bg border border-fm-warning-border rounded-fm-btn p-3">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {status === 'partial' && (
        <div className="text-sm text-fm-warning bg-fm-warning-bg border border-fm-warning-border rounded-fm-btn p-3">
          Some failure modes could not be converted. The successful drafts are shown below.
        </div>
      )}

      {/* Draft cards */}
      <div className="space-y-3">
        {drafts.map((draft) => (
          <DraftCard
            key={draft.draft_id}
            draft={draft}
            conversionId={conversion.conversion_id}
            onEdit={() => onEdit(draft)}
            onVerify={() => onVerify(draft)}
            onDelete={() => onDelete(draft)}
            isFileScan={isFileScan}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Draft Card
// =============================================================================

interface DraftCardProps {
  draft: ConversionDraft;
  conversionId: string;
  onEdit: () => void;
  onVerify: () => void;
  onDelete: () => void;
  isFileScan: boolean;
}

function DraftCard({ draft, onEdit, onVerify, onDelete: _onDelete, isFileScan }: DraftCardProps) {
  const { validation, quality_score, quality_warning } = draft;
  const color = gradeColor[quality_score.grade] || 'text-fm-text-secondary';

  return (
    <div className="bg-fm-surface rounded-fm-card border border-fm-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-fm-text-primary truncate">{draft.title}</h4>
            <span className={`text-xs font-mono font-medium ${color}`}>
              {quality_score.overall.toFixed(0)}/{quality_score.grade}
            </span>
          </div>

          {/* Validation status */}
          {validation.passed ? (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-fm-success">Validation: PASSED</span>
              {validation.warnings.length > 0 && (
                <span className="text-fm-text-tertiary">({validation.warnings.length} warning{validation.warnings.length !== 1 ? 's' : ''})</span>
              )}
            </div>
          ) : (
            <div className="text-xs text-fm-critical">
              Validation: FAILED ({validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''})
              <ul className="mt-1 list-disc list-inside text-fm-text-secondary">
                {validation.errors.slice(0, 3).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {validation.errors.length > 3 && (
                  <li>...and {validation.errors.length - 3} more</li>
                )}
              </ul>
            </div>
          )}

          {/* Quality warning */}
          {quality_warning && (
            <p className="mt-2 text-xs text-fm-warning">{quality_warning}</p>
          )}
        </div>

        {/* Score breakdown — only for document conversions where quality review matters */}
        {!isFileScan && (
          <div className="flex-shrink-0 text-right">
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-fm-text-tertiary">
              <span>Complete</span><span className="font-mono">{quality_score.completeness.toFixed(0)}</span>
              <span>Clarity</span><span className="font-mono">{quality_score.clarity.toFixed(0)}</span>
              <span>Action</span><span className="font-mono">{quality_score.actionability.toFixed(0)}</span>
              <span>Breadth</span><span className="font-mono">{quality_score.comprehensiveness.toFixed(0)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-fm-border">
        {draft.status === 'verified' ? (
          <span className="px-3 py-1.5 text-xs font-medium text-fm-success bg-fm-success-bg rounded-fm-btn">
            Activated
          </span>
        ) : (
          <>
            <button
              onClick={onEdit}
              className="px-3 py-1.5 text-xs font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onVerify}
              disabled={!validation.passed}
              className="px-3 py-1.5 text-xs font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={!validation.passed ? 'Fix validation errors before activating' : 'Activate runbook into knowledge base'}
            >
              Activate
            </button>
          </>
        )}
      </div>
    </div>
  );
}
