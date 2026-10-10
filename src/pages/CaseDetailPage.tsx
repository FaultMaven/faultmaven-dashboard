import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { CaseStateBadge } from '../components/CaseStateBadge';
import { CaseStageCell } from '../components/CaseStageCell';
import { caseTurnCount } from '../lib/cases/turnLabel';
import { CaseTabs } from '../components/CaseTabs';
import { ConversationDock } from '../components/ConversationDock';
import { TeamShareBadge } from '../components/TeamShareBadge';
import { ShareCaseModal } from '../components/ShareCaseModal';
import { CaseDriverField } from '../components/CaseDriverField';
import { CasePersonName } from '../components/CasePersonName';
import { useAuth } from '../context/AuthContext';
import { useTeamSharing } from '../hooks/useTeamSharing';
import { useDockFits } from '../hooks/useDockFits';
import { readDockCollapsed, writeDockCollapsed } from '../lib/cases/dockPreference';
import { resolveCaseConversationLayout } from '../lib/cases/conversationSurface';
import { creatorLabel, isCaseCreator, isCaseDriver } from '../lib/cases/driver';
import { usePrefersExtensionForChat } from '../hooks/useChatSurface';
import { getCaseDetail, fetchCaseMarkdown, logoutAuth } from '../lib/api';
import type { CaseDetail, CaseSummary } from '../types/cases';

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

  const dockFits = useDockFits();
  const prefersExtension = usePrefersExtensionForChat();
  // Seeded from the stored preference rather than read on every render: the
  // toggle below is the only writer, so React state is the live value and
  // storage is where it survives a reload.
  const [dockOpen, setDockOpen] = useState(() => !readDockCollapsed());

  // The write is OUTSIDE the updater. React may double-invoke an updater in
  // StrictMode and may replay or discard one when a higher-priority render
  // interleaves, so a `localStorage` write in there can fire for a transition
  // that is then thrown away — leaving the stored preference disagreeing with
  // the dock on the next load. Updaters must be pure; this one reads `dockOpen`
  // directly because the toggle is a user gesture and cannot race itself.
  const toggleDock = () => {
    const next = !dockOpen;
    writeDockCollapsed(!next);
    setDockOpen(next);
  };

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

  // The docked panel changed a case (a committed turn, or a state transition it
  // saw). It has its own store and nobody here reads it, so the header re-reads
  // the case from the server. QUIET (no spinner): `loading` unmounts the page
  // body, and with it the dock — a refresh must not drop the conversation the
  // user is in. An id that is not this page's case (the panel can switch cases)
  // is not ours to refresh. "Ours" is the case the panel was mounted with
  // (`caseDetail.case_id`, what both mounts receive), not the route param.
  const shownCaseId = caseDetail?.case_id;
  const handleCaseChanged = useCallback(
    (changedId: string) => {
      if (changedId === shownCaseId) void loadCase();
    },
    [shownCaseId, loadCase]
  );

  // The driver changed (ADR-020 D4). Applied AT ONCE from the server's answer,
  // so the dock and the read-only state follow the new driver in this render
  // rather than after a round trip — a viewer who handed the case away must
  // not keep a composer the server will now refuse. Then the whole case is
  // re-read QUIETLY (the hand-off bumped its version). Only the driver fields
  // are taken from the answer: it is a `CaseSummary`, and the page holds a
  // `CaseDetail`. An answer for a case this page no longer shows is ignored.
  const handleDriverReassigned = useCallback(
    (updated: CaseSummary) => {
      setCaseDetail((prev) =>
        prev && prev.case_id === updated.case_id
          ? {
              ...prev,
              driver_id: updated.driver_id,
              driver_display_name: updated.driver_display_name,
            }
          : prev
      );
      void loadCase();
    },
    [loadCase]
  );
  const handleDriverStale = useCallback(() => void loadCase(), [loadCase]);

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

  const viewerId = authState?.user?.user_id;

  // Share-to-team is the CREATOR's (ADR-020 D2 — governance: share, unshare,
  // delete; the backend enforces the same) and only shown where team sharing
  // is live. Not the driver's: driving a case is not a right to widen who
  // reads it. The badge itself needs neither gate — a case carries team ids
  // only where sharing is wired.
  const canShare = teamSharingEnabled && isCaseCreator(caseDetail, viewerId);

  /**
   * Whether the person looking at this case DRIVES it (ADR-020).
   *
   * Every reader views a case; its one driver writes it. A reader who does not
   * drive it — a teammate it is shared with, or its creator after handing it
   * on — must not be handed a composer: the server refuses their turns, and
   * the panel would offer an upload and a composer that can only fail.
   *
   * Derived from the case's own `driver_id` (the EFFECTIVE driver on the
   * wire), never from `user_id` and never from whether this page offers a
   * Share button, and it FAILS CLOSED: an unknown viewer or an unknown driver
   * is not a match.
   */
  const isDriver = isCaseDriver(caseDetail, viewerId);

  // The one question, asked once for the whole page (ADR-018 D2). Every input
  // is real: who drives from the case, width from the viewport, the dock's own
  // state, and the person's preference about where chat lives.
  const layout = resolveCaseConversationLayout({
    isDriver,
    prefersExtension,
    dockFits,
    dockOpen,
  });

  // Once, beside the other header derivations: the count and its plural have to
  // come from the same answer, or a later change that makes this non-pure
  // renders "1 turns".
  const turns = caseTurnCount(caseDetail);

  return (
    /*
     * VIEWPORT-BOUNDED, not content-driven — a fixed height, not `min-h-screen`.
     *
     * The Transcript tab hosts the Copilot panel, and a panel is only usable if
     * its composer is on screen. While this page grew with its content the
     * panel had to name its own height, `h-[70vh] min-h-[28rem]`, which starts
     * wherever the case card happens to end: measured in a browser at
     * y≈384, putting the composer at y≈943 on a 900px viewport and y≈851 on
     * 768 — below the fold at both, so the first thing a user had to do to
     * type was scroll.
     *
     * Bounding the page instead lets the panel take exactly the room that is
     * left, which is what `/investigate` already does and why it fits. The case
     * header stays put because it is a non-shrinking sibling rather than
     * something the page scrolls away.
     *
     * `h-dvh`, not `h-screen`: `vh` ignores mobile browser toolbars, so the
     * bottom of the page — the composer — sits under them. And `min-h-[40rem]`
     * below the viewport height, so a genuinely short window (a laptop with
     * devtools open, a split screen) SCROLLS the page instead of crushing the
     * panel to nothing. Bounding the page must not mean the content has no
     * floor; that trades one unusable layout for another.
     */
    <div
      data-testid="case-detail-root"
      className={`flex flex-col bg-fm-canvas ${
        layout.viewportBounded ? 'h-dvh min-h-[40rem]' : 'min-h-screen'
      }`}
    >
      <PageHeader onLogout={handleLogout} />

      {/* `min-h-0` is load-bearing on every flex child down to the panel: a
          flex item's default `min-height:auto` refuses to shrink below its
          content, so one missing instance pushes the overflow back onto the
          page and the composer back below the fold. */}
      <main className="flex-1 min-h-0 w-full max-w-7xl mx-auto px-6 py-8 flex flex-col">
        <Link to="/cases" className="flex-shrink-0 text-sm text-fm-text-secondary hover:text-fm-accent transition-colors mb-4 inline-block">
          ← Cases
        </Link>

        {/* Case header. `flex-shrink-0`: it stays visible while the panel
            below it takes the remaining height. */}
        <div className="flex-shrink-0 bg-fm-surface rounded-fm-card border border-fm-border p-5 mb-5">
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
                {/* Only when a stage exists. In the tables a column header gives
                    the muted em dash its meaning; here there is no header, so a
                    bare dash floating between two badges reads as a glitch. This
                    condition is the exact complement of the cell's own muted
                    branch, so the header shows a stage precisely when the cell
                    would have something to say. The cell still owns every
                    label — this decides only whether to render it at all. */}
                {caseDetail.state === 'investigating' && caseDetail.current_stage && (
                  <CaseStageCell
                    state={caseDetail.state}
                    stage={caseDetail.current_stage}
                    turnsWithoutProgress={caseDetail.turns_without_progress}
                  />
                )}
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
            {/* Creator and driver (ADR-020 D5): who governs the case and who
                writes it. The driver field also carries the hand-off, for the
                two people allowed it — keyed by case, so a candidate list read
                for one case is never offered on the next. */}
            <span data-testid="case-creator">
              Creator{' '}
              <span className="text-fm-text-secondary">
                <CasePersonName label={creatorLabel(caseDetail)} />
              </span>
            </span>
            <span>&middot;</span>
            <CaseDriverField
              key={caseDetail.case_id}
              caseId={caseDetail.case_id}
              parties={caseDetail}
              sharedTeamIds={caseDetail.shared_team_ids}
              viewerId={viewerId}
              onReassigned={handleDriverReassigned}
              onCaseStale={handleDriverStale}
            />
            <span>&middot;</span>
            <span>{turns} turn{turns !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* THE RECORD ON THE LEFT, THE CONVERSATION ON THE RIGHT — the whole
            point of the dock (ADR-018 D2), and the workflow #124 removed by
            making them mutually exclusive tabs. The case header above spans
            both: it identifies the case, and neither column owns that.

            `min-w-0` on the record column so a wide table or a long unbroken
            token inside a tab cannot push the dock off the side — a flex item
            refuses to shrink below its content without it, the same trap as
            `min-h-0` one axis over. */}
        <div className="flex-1 min-h-0 flex gap-5 mb-5">
          <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-fm-surface rounded-fm-card border border-fm-border p-5">
            <CaseTabs
              caseId={caseDetail.case_id}
              caseDetail={caseDetail}
              layout={layout}
              readOnly={!isDriver}
              onCaseChanged={handleCaseChanged}
            />
          </div>

          {layout.dockPresent && (
            <ConversationDock
              caseId={caseDetail.case_id}
              readOnly={!isDriver}
              open={dockOpen}
              onToggle={toggleDock}
              onCaseChanged={handleCaseChanged}
            />
          )}
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
