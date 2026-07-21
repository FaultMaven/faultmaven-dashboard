import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { CaseStateBadge } from '../components/CaseStateBadge';
import { MilestoneProgress } from '../components/MilestoneProgress';
import { CaseTabs } from '../components/CaseTabs';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TeamShareBadge } from '../components/TeamShareBadge';
import { ShareCaseModal } from '../components/ShareCaseModal';
import { useAuth } from '../context/AuthContext';
import { useTeamSharing } from '../hooks/useTeamSharing';
import { getCaseDetail, archiveCase, annotateCase, logoutAuth } from '../lib/api';
import type { CaseDetail, CaseAnnotation } from '../types/cases';

export default function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { clearAuthState, authState } = useAuth();
  const { enabled: teamSharingEnabled, teams, teamsById } = useTeamSharing();

  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const [annotation, setAnnotation] = useState<CaseAnnotation>({});
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [annotationSaved, setAnnotationSaved] = useState(false);
  const [annotationError, setAnnotationError] = useState<string | null>(null);

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  const loadCase = useCallback(
    async (opts: { withSpinner?: boolean } = {}) => {
      if (!caseId) return;
      if (opts.withSpinner) setLoading(true);
      try {
        const detail = await getCaseDetail(caseId);
        setCaseDetail(detail);
        setAnnotation({ resolution_notes: detail.closure_reason ?? '' });
      } catch (err) {
        // Only the initial load owns the page-level error (which swaps the whole
        // page for an error view). A best-effort background refresh — e.g. after
        // a team-share change — must not blow away a working page on a transient
        // failure; the triggering action surfaces its own error.
        if (opts.withSpinner) {
          setError(err instanceof Error ? err.message : 'Failed to load case');
        }
      } finally {
        if (opts.withSpinner) setLoading(false);
      }
    },
    [caseId]
  );

  useEffect(() => {
    void loadCase({ withSpinner: true });
  }, [loadCase]);

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

  // Share-to-team is owner-only (the backend enforces the same) and only shown
  // where team sharing is live. The badge itself needs neither gate — a case
  // carries team ids only where sharing is wired.
  const canShare =
    teamSharingEnabled && caseDetail.user_id === authState?.user?.user_id;

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
                <CaseStateBadge state={caseDetail.state} />
                <MilestoneProgress
                  completed={caseDetail.milestones_completed.length}
                  total={caseDetail.milestones_completed.length + (caseDetail.pending_milestones?.length || 0)}
                  transparent={caseDetail.state === 'investigating' && caseDetail.turns_without_progress >= 5}
                />
                <TeamShareBadge teamIds={caseDetail.shared_team_ids} teamsById={teamsById} />
              </div>
            </div>
            <div className="flex-shrink-0 flex items-center gap-2">
              {canShare && (
                <button
                  onClick={() => setShowShareModal(true)}
                  className="px-3 py-1.5 text-xs text-fm-text-secondary border border-fm-border rounded-fm-btn hover:text-fm-accent hover:border-fm-accent/40 hover:bg-fm-accent/10 transition-colors"
                >
                  Share
                </button>
              )}
              {caseDetail.is_terminal && !caseDetail.is_archived && (
                <button
                  onClick={() => setShowArchiveConfirm(true)}
                  disabled={archiving}
                  className="px-3 py-1.5 text-xs text-fm-text-tertiary border border-fm-border rounded-fm-btn hover:text-fm-warning hover:border-fm-warning/40 hover:bg-fm-warning/10 transition-colors disabled:opacity-50"
                >
                  Archive
                </button>
              )}
            </div>
          </div>

          {/* Meta row */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-fm-text-tertiary">
            <span className="font-mono text-fm-text-tertiary select-all">{caseDetail.case_id}</span>
            <span>&middot;</span>
            <span>Created {new Date(caseDetail.created_at).toLocaleDateString()}</span>
            <span>&middot;</span>
            <span>{caseDetail.current_turn} turn{caseDetail.current_turn !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-fm-surface rounded-fm-card border border-fm-border p-5 mb-5">
          <CaseTabs
            caseId={caseDetail.case_id}
            caseDetail={caseDetail}
            resolutionNotes={caseDetail.is_terminal ? {
              notes: annotation.resolution_notes ?? '',
              onChange: (notes) => setAnnotation({ ...annotation, resolution_notes: notes }),
              onSave: handleSaveAnnotation,
              saving: savingAnnotation,
              saved: annotationSaved,
              error: annotationError,
              disabled: caseDetail.state === 'closed',
            } : undefined}
          />
        </div>

      </main>

      <ConfirmDialog
        isOpen={showArchiveConfirm}
        title="Archive Case"
        message="Archive this case? It will be hidden from the default case list. You can view it again by checking 'Include archived'."
        confirmLabel="Archive"
        onConfirm={handleArchive}
        onCancel={() => setShowArchiveConfirm(false)}
      />

      <ShareCaseModal
        isOpen={showShareModal}
        caseId={caseDetail.case_id}
        sharedTeamIds={caseDetail.shared_team_ids}
        teams={teams}
        onClose={() => setShowShareModal(false)}
        onChanged={() => void loadCase()}
      />
    </div>
  );
}
