import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { CaseStateBadge } from '../components/CaseStateBadge';
import { CaseStageCell } from '../components/CaseStageCell';
import { CaseTabs } from '../components/CaseTabs';
import { TeamShareBadge } from '../components/TeamShareBadge';
import { ShareCaseModal } from '../components/ShareCaseModal';
import { useAuth } from '../context/AuthContext';
import { useTeamSharing } from '../hooks/useTeamSharing';
import { getCaseDetail, fetchCaseMarkdown, logoutAuth } from '../lib/api';
import type { CaseDetail } from '../types/cases';

export default function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const { clearAuthState, authState } = useAuth();
  const { enabled: teamSharingEnabled, teams, teamsById } = useTeamSharing();

  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  // Monotonic request id: guards against a stale in-flight load (from a
  // previous caseId) resolving after a newer one and clobbering the page.
  const reqIdRef = useRef(0);

  const loadCase = useCallback(
    async (opts: { withSpinner?: boolean } = {}) => {
      if (!caseId) return;
      const reqId = ++reqIdRef.current;
      if (opts.withSpinner) {
        setLoading(true);
        // Reset the page-level error at the start of a fresh load; otherwise a
        // failure on one case poisoned every later navigation with a stale
        // error view even after a successful fetch.
        setError(null);
      }
      try {
        const detail = await getCaseDetail(caseId);
        if (reqId !== reqIdRef.current) return; // superseded by a newer load
        setCaseDetail(detail);
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        // Only the initial load owns the page-level error (which swaps the whole
        // page for an error view). A best-effort background refresh — e.g. after
        // a team-share change — must not blow away a working page on a transient
        // failure; the triggering action surfaces its own error.
        if (opts.withSpinner) {
          setError(err instanceof Error ? err.message : 'Failed to load case');
        }
      } finally {
        if (reqId === reqIdRef.current && opts.withSpinner) setLoading(false);
      }
    },
    [caseId]
  );

  useEffect(() => {
    void loadCase({ withSpinner: true });
  }, [loadCase]);

  // "Export / Archive to Markdown" (D2): a read-only client-side download of a
  // self-contained case record. Not a mutation — the backend retention-archiving
  // transition is a separate workstream (ADR-014).
  const handleExport = async () => {
    if (!caseDetail) return;
    setExporting(true);
    setExportError(null);
    try {
      const markdown = await fetchCaseMarkdown(caseDetail.case_id, caseDetail);
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `case_${caseDetail.case_id}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export case');
    } finally {
      setExporting(false);
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
                <CaseStageCell
                  state={caseDetail.state}
                  stage={caseDetail.current_stage ?? null}
                  turnsWithoutProgress={caseDetail.turns_without_progress}
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
              {caseDetail.is_terminal && (
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  title="Download a self-contained Markdown record of this case"
                  className="px-3 py-1.5 text-xs text-fm-text-secondary border border-fm-border rounded-fm-btn hover:text-fm-accent hover:border-fm-accent/40 hover:bg-fm-accent/10 transition-colors disabled:opacity-50"
                >
                  {exporting ? 'Exporting…' : 'Export to Markdown'}
                </button>
              )}
            </div>
          </div>

          {exportError && (
            <p className="mt-2 text-xs text-fm-critical">{exportError}</p>
          )}

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
          <CaseTabs caseId={caseDetail.case_id} caseDetail={caseDetail} />
        </div>

      </main>

      <ShareCaseModal
        isOpen={showShareModal}
        caseId={caseDetail.case_id}
        sharedTeamIds={caseDetail.shared_team_ids ?? []}
        teams={teams}
        onClose={() => setShowShareModal(false)}
        onChanged={() => void loadCase()}
      />
    </div>
  );
}
