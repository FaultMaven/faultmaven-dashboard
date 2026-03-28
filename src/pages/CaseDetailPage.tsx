import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { CaseStatusBadge } from '../components/CaseStatusBadge';
import { MilestoneProgress } from '../components/MilestoneProgress';
import { CaseTabs } from '../components/CaseTabs';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { getCaseDetail, archiveCase, annotateCase, logoutAuth } from '../lib/api';
import type { CaseDetail, CaseAnnotation } from '../types/cases';

export default function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { clearAuthState } = useAuth();

  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [annotation, setAnnotation] = useState<CaseAnnotation>({});
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [annotationSaved, setAnnotationSaved] = useState(false);
  const [annotationError, setAnnotationError] = useState<string | null>(null);

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  useEffect(() => {
    if (!caseId) return;
    setLoading(true);
    getCaseDetail(caseId)
      .then((detail) => {
        setCaseDetail(detail);
        setAnnotation({
          resolution_notes: detail.closure_reason ?? '',
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load case'))
      .finally(() => setLoading(false));
  }, [caseId]);

  const handleArchive = async () => {
    if (!caseId) return;
    setArchiving(true);
    try {
      await archiveCase(caseId);
      navigate('/cases');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive case');
    } finally {
      setArchiving(false);
      setShowArchiveConfirm(false);
    }
  };

  const handleSaveAnnotation = async () => {
    if (!caseId) return;
    setSavingAnnotation(true);
    setAnnotationError(null);
    try {
      await annotateCase(caseId, annotation);
      setAnnotationSaved(true);
      setTimeout(() => setAnnotationSaved(false), 2000);
    } catch (err) {
      setAnnotationError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingAnnotation(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-fm-canvas">
        <PageHeader onLogout={handleLogout} />
        <div className="max-w-7xl mx-auto px-6 py-8 text-fm-text-tertiary">Loading case...</div>
      </div>
    );
  }

  if (error || !caseDetail) {
    return (
      <div className="min-h-screen bg-fm-canvas">
        <PageHeader onLogout={handleLogout} />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <p className="text-fm-critical text-sm">{error ?? 'Case not found.'}</p>
          <Link to="/cases" className="text-fm-accent text-sm hover:underline mt-2 inline-block">
            ← Back to Cases
          </Link>
        </div>
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Link to="/cases" className="text-sm text-fm-text-secondary hover:text-fm-accent transition-colors mb-4 inline-block">
          ← Cases
        </Link>

        {/* Case header */}
        <div className="bg-fm-surface rounded-fm-card border border-fm-border p-5 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">
                {caseDetail.title || 'Untitled Case'}
              </h2>
              {caseDetail.description && (
                <p className="text-sm text-fm-text-secondary mb-2 line-clamp-2">
                  {caseDetail.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <CaseStatusBadge status={caseDetail.status} />
                <MilestoneProgress
                  completed={caseDetail.milestones_completed}
                  total={caseDetail.total_milestones}
                />
              </div>
            </div>
            {caseDetail.is_terminal && !caseDetail.is_archived && (
              <button
                onClick={() => setShowArchiveConfirm(true)}
                disabled={archiving}
                className="flex-shrink-0 px-4 py-2 text-sm font-medium text-fm-warning border border-fm-warning/40 rounded-fm-btn hover:bg-fm-warning/10 transition-colors disabled:opacity-50"
              >
                Archive
              </button>
            )}
          </div>

          {/* Meta row */}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-fm-text-tertiary">
            {caseDetail.current_stage && (
              <span>Stage: <span className="text-fm-text-secondary capitalize">{caseDetail.current_stage.replace(/_/g, ' ')}</span></span>
            )}
            <span>Evidence: <span className="text-fm-text-secondary">{caseDetail.evidence_count}</span></span>
            <span>Hypotheses: <span className="text-fm-text-secondary">{caseDetail.hypothesis_count}</span></span>
            <span>Created: <span className="text-fm-text-secondary">{new Date(caseDetail.created_at).toLocaleDateString()}</span></span>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-fm-surface rounded-fm-card border border-fm-border p-5 mb-5">
          <CaseTabs caseId={caseDetail.case_id} caseDetail={caseDetail} />
        </div>

        {/* Resolution Notes — only for terminal cases */}
        {caseDetail.is_terminal && (
          <div className="bg-fm-surface rounded-fm-card border border-fm-border p-5">
            <h3 className="text-base font-semibold text-fm-text-primary mb-3">Resolution Notes</h3>
            <textarea
              value={annotation.resolution_notes ?? ''}
              onChange={(e) => setAnnotation({ ...annotation, resolution_notes: e.target.value })}
              className={`${inputClass} min-h-[100px] resize-y`}
              placeholder="Add resolution notes, root cause findings, or follow-up actions..."
              disabled={caseDetail.status === 'closed'}
            />
            {annotationError && (
              <p className="text-fm-critical text-xs mt-2">{annotationError}</p>
            )}
            {caseDetail.status !== 'closed' && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handleSaveAnnotation}
                  disabled={savingAnnotation}
                  className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
                >
                  {savingAnnotation ? 'Saving...' : 'Save Notes'}
                </button>
                {annotationSaved && (
                  <span className="text-fm-success text-sm">Saved</span>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <ConfirmDialog
        isOpen={showArchiveConfirm}
        title="Archive Case"
        message="Archive this case? It will be hidden from the default case list. You can view it again by checking 'Include archived'."
        confirmLabel="Archive"
        onConfirm={handleArchive}
        onCancel={() => setShowArchiveConfirm(false)}
      />
    </div>
  );
}
