import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getCaseMessages,
  getUploadedFiles,
  getUploadedFileDetails,
  getCaseEvidenceList,
  getCaseUI,
} from '../lib/api';
import type {
  CaseDetail,
  CaseMessage,
  UploadedFile,
  UploadedFileDetails,
  EvidenceDetails,
  HypothesisState,
  HypothesisSummary,
} from '../types/cases';
import { ReportTab } from './ReportTab';
import { IssueTab } from './IssueTab';
import { TranscriptView } from './TranscriptView';
import { CasePanelMount } from './CasePanelMount';
import { StaleNote } from './StaleNote';
import type { CaseConversationLayout } from '../lib/cases/conversationSurface';

type Tab = 'transcript' | 'evidence' | 'hypotheses' | 'report' | 'issue';

/**
 * Where to land when what was chosen is not in the strip.
 *
 * Only reachable when the dock has taken Transcript away, or when a deep link
 * names a tab this case does not have. First-visible is right HERE and wrong as
 * a general default — see the note at its call site.
 */
function fallbackTab(tabs: { id: Tab }[]): Tab {
  return tabs[0].id;
}

interface CaseTabsProps {
  caseId: string;
  caseDetail: CaseDetail;
  /**
   * How the page resolved ADR-018 D2's one question — decided ONCE, by the
   * page, and handed down whole.
   *
   * Passed in rather than re-derived here because `CaseDetailPage` renders the
   * dock and owns the page's height, and two components answering the same
   * question from the same inputs is two chances to disagree: a page that
   * docked the conversation while this component also offered it as a tab
   * would put two live panels on one screen (ADR-018 D6 forbids it outright),
   * and a page that grew with its content while this component scrolled
   * internally would cramp the record inside a page with room to spare.
   *
   * Whole, not one field at a time, for the same reason — two props that must
   * agree are two props that can stop agreeing.
   */
  layout: CaseConversationLayout;

  /**
   * Belt and braces on the panel's own authoring guard.
   *
   * The rule already sends a reader who does not drive the case to the record,
   * so the live arm below is unreachable for them — this is deliberately a
   * SECOND, independent expression of the same fact, derived from the case's
   * `driver_id` by the page (ADR-020). The dock states it too. If a future
   * input to the rule is wrong in one place, a viewer must still not be handed
   * a composer on a case someone else drives, and the two mount points must
   * not disagree about whether that guard is worth having.
   */
  readOnly: boolean;
  /** Forwarded to the docked panel; see CopilotPanelMount. */
  onCaseChanged?: (caseId: string) => void;
}

function hypothesisStatusStyle(state: HypothesisState): { color: string; symbol: string } {
  switch (state) {
    case 'validated':
      return { color: 'text-fm-success', symbol: '✓' };
    case 'refuted':
      return { color: 'text-fm-critical', symbol: '✗' };
    case 'active':
      return { color: 'text-fm-accent', symbol: '●' };
    case 'inconclusive':
      return { color: 'text-fm-warning', symbol: '◌' };
    case 'retired':
      return { color: 'text-fm-text-tertiary', symbol: '○' };
    default:
      return { color: 'text-fm-text-secondary', symbol: '○' };
  }
}

function evidenceCategoryLabel(category: string): string {
  return category.replace(/_/g, ' ').toLowerCase();
}

function analysisStatusDotColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-fm-success';
    case 'failed':
      return 'bg-fm-critical';
    case 'processing':
      return 'bg-fm-accent';
    case 'pending':
    default:
      return 'bg-fm-text-tertiary';
  }
}

function stanceColor(stance: string): string {
  switch (stance.toUpperCase()) {
    case 'SUPPORTS':
      return 'text-fm-success';
    case 'REFUTES':
      return 'text-fm-critical';
    case 'NEUTRAL':
    default:
      return 'text-fm-text-tertiary';
  }
}

/**
 * A read a tab makes for itself, made again whenever the case's REVISION moves.
 *
 * The docked panel changes the case while these tabs are on screen, and the
 * page re-reads `caseDetail` when it says so (#204, #205) — but a tab that
 * fetched on `caseId` alone never heard about it, so an Evidence or Hypotheses
 * list stayed as it was when the tab opened (#206). The revision is
 * `caseDetail.updated_at`: the core stamps it on every save of the case, which
 * a turn (uploads ride turns), a reclassification and a close all are, while
 * `current_turn` misses the last two.
 *
 * Only the FIRST read for a case shows the loading state. A revision read is
 * quiet: the rows already on screen stay, and with them anything the user has
 * expanded, until the new answer replaces them. A revision read that FAILS
 * keeps the rows too, as `CaseDetailPage.loadCase` keeps a working page; the
 * error is shown only when there is nothing else to show. The rows are then
 * `stale`, and the tab says so in one line (`StaleNote`): a list that silently
 * kept "active" hypotheses after the dock closed the case would be a claim
 * the server no longer makes. The next successful read clears it; there is no
 * retry button, because the next revision retries anyway.
 *
 * What is held is keyed by the case it was read for, so a read or an error held
 * for one case can never stand in for another. Today that is defence, not a
 * fix: `CaseDetailPage` shows its loading view on a case change, which unmounts
 * these tabs, so a mounted tab never sees `caseId` move. The keying keeps the
 * hook correct without leaning on that.
 *
 * It also holds the REVISION it read, so `refreshing` says when what is shown
 * is older than the case and a newer read is on its way — the record
 * transcript, which waits behind other tabs, catches up visibly with it.
 *
 * A read the next revision superseded is dropped (`cancelled`), so an older
 * answer that lands late cannot put an older list back.
 *
 * `read` must be stable (module-level, or memoised): it is an effect input.
 */
function useCaseRead<T>(
  caseId: string,
  revision: string,
  read: (caseId: string) => Promise<T>,
  failure: string,
): { data: T | null; loading: boolean; error: string | null; stale: boolean; refreshing: boolean } {
  const [held, setHeld] = useState<{ caseId: string; revision: string; data: T } | null>(null);
  const [failed, setFailed] = useState<{ caseId: string; revision: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    read(caseId).then(
      (data) => {
        if (cancelled) return;
        setHeld({ caseId, revision, data });
        setFailed(null);
      },
      (err: unknown) => {
        if (!cancelled) setFailed({ caseId, revision, message: err instanceof Error ? err.message : failure });
      },
    );
    return () => { cancelled = true; };
  }, [caseId, revision, read, failure]);

  const have = held !== null && held.caseId === caseId;
  const failedHere = failed !== null && failed.caseId === caseId;
  const error = !have && failedHere ? failed.message : null;
  // In flight for a newer revision, and not already refused at this one.
  const refreshing = have && held.revision !== revision && !(failedHere && failed.revision === revision);
  return { data: have ? held.data : null, loading: !have && error === null, error, stale: have && failedHere, refreshing };
}

const readMessages = (caseId: string): Promise<CaseMessage[]> =>
  getCaseMessages(caseId).then((res) => res.messages);
const readEvidence = (caseId: string): Promise<EvidenceDetails[]> =>
  getCaseEvidenceList(caseId).then((res) => res.evidence);
const readFiles = (caseId: string): Promise<UploadedFile[]> =>
  getUploadedFiles(caseId).then((res) => res.files);
const readHypotheses = (caseId: string): Promise<HypothesisSummary[]> =>
  getCaseUI(caseId).then((ui) => ui.active_hypotheses ?? []);

/**
 * The conversation as RECORD — read, not continued.
 *
 * One `GET /cases/{id}/messages`, rendered by `TranscriptView`: no panel, no
 * package chunk, no session. This is what the Dashboard showed until #124
 * replaced it with a live composer, and ADR-018 D2 restores it, because a
 * transcript belongs in the same category as the report and the evidence —
 * something a person reads about a case.
 *
 * It follows the revision like the other tabs, but only while it is the ACTIVE
 * tab: `CaseTabs` keeps it mounted and hidden behind the others, and hands it
 * the revision it last showed (`transcriptAt`) rather than the case's.
 * `getCaseMessages` pages at 100 messages a request, one after another, so
 * following every turn from behind Evidence would make reading Evidence cost a
 * whole transcript download per turn. On returning to Transcript it catches up
 * with one re-read, the old rows staying until the new ones arrive under an
 * "Updating…" line, so a reply missing from them is not read as absent.
 *
 * Following matters at all because a dock collapsed mid-turn keeps its panel
 * mounted and commits the turn behind the rail, with this record on screen. A
 * hand-off moves `version` and not `updated_at`, so it costs no re-read.
 *
 * The renderer is shared with the operator break-glass page (ADR-012 D9): the
 * backend serves the same message shape to both, and a second copy of this
 * markup here would let the two drift.
 */
function RecordTranscriptTab({ caseId, revision }: { caseId: string; revision: string }) {
  const { data: messages, loading, error, stale, refreshing } = useCaseRead(caseId, revision, readMessages, 'Failed to load transcript');

  if (loading) return <div className="text-fm-text-tertiary text-sm py-4">Loading transcript...</div>;
  if (error) return <div className="text-fm-critical text-sm py-4">{error}</div>;

  return (
    <div data-testid="transcript-record">
      <StaleNote stale={stale} />
      {refreshing && !stale && (
        <p role="status" className="text-xs text-fm-text-tertiary mb-2">Updating…</p>
      )}
      <TranscriptView messages={messages ?? []} />
    </div>
  );
}

function FileEvidenceDetails({ caseId, fileId, revision }: { caseId: string; fileId: string; revision: string }) {
  // Keyed by case only: the parent keys this component by file, so `fileId`
  // never changes under a mounted instance.
  const read = useCallback(
    (id: string): Promise<UploadedFileDetails> => getUploadedFileDetails(id, fileId),
    [fileId],
  );
  const { data: details, loading, error, stale } = useCaseRead(caseId, revision, read, 'Failed to load details');

  if (loading) return <div className="text-fm-text-tertiary text-xs py-2 italic">Loading derived evidence...</div>;
  if (error) return <div className="text-fm-critical text-xs py-2">{error}</div>;
  if (!details) return null;

  const evidence = details.derived_evidence ?? [];

  return (
    <div className="py-2 space-y-3">
      <StaleNote stale={stale} />
      {details.summary && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1">Summary</p>
          <p className="text-sm text-fm-text-primary">{details.summary}</p>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1.5">
          Derived evidence ({evidence.length})
        </p>
        {evidence.length === 0 ? (
          <p className="text-sm text-fm-text-tertiary italic">No evidence was extracted from this file.</p>
        ) : (
          <ul className="space-y-2">
            {evidence.map((e) => (
              <li key={e.evidence_id} className="text-sm text-fm-text-primary">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-fm-elevated text-fm-text-secondary">
                    {evidenceCategoryLabel(e.category)}
                  </span>
                  <span className="text-[10px] text-fm-text-tertiary uppercase tracking-wide">
                    {e.source_type} · turn {e.collected_at_turn}
                  </span>
                  {e.related_hypothesis_ids && e.related_hypothesis_ids.length > 0 && (
                    <span className="text-[10px] text-fm-accent">
                      → {e.related_hypothesis_ids.length} hypothes{e.related_hypothesis_ids.length === 1 ? 'is' : 'es'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-fm-text-primary">{e.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EvidenceListView({ caseId, revision }: { caseId: string; revision: string }) {
  const { data: evidence, loading, error, stale } = useCaseRead(caseId, revision, readEvidence, 'Failed to load evidence');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) return <div className="text-fm-text-tertiary text-sm py-4">Loading evidence...</div>;
  if (error) return <div className="text-fm-critical text-sm py-4">{error}</div>;
  if (!evidence?.length) {
    return (
      <>
        <StaleNote stale={stale} />
        <div className="text-fm-text-tertiary text-sm py-4">No evidence collected yet.</div>
      </>
    );
  }

  return (
    <>
      <StaleNote stale={stale} />
      <div className="divide-y divide-fm-border">
        {evidence.map((ev) => {
          const isExpanded = expandedId === ev.evidence_id;
          const hypothesisCount = ev.related_hypotheses?.length ?? 0;
          const sourceLabel = ev.source_file
            ? `${ev.source_file.filename} · turn ${ev.collected_at_turn}`
            : `chat · turn ${ev.collected_at_turn}`;
          return (
            <div key={ev.evidence_id} className="py-2">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : ev.evidence_id)}
                className="w-full flex items-start justify-between gap-3 text-left hover:bg-fm-elevated/40 -mx-2 px-2 py-1 rounded transition-colors"
                aria-expanded={isExpanded}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-fm-elevated text-fm-text-secondary">
                      {evidenceCategoryLabel(ev.category)}
                    </span>
                    <span className="text-sm text-fm-text-primary">{ev.summary}</span>
                  </div>
                  <p className="text-xs text-fm-text-tertiary mt-1">
                    {sourceLabel}
                    {hypothesisCount > 0 && (
                      <> · {hypothesisCount} hypothes{hypothesisCount === 1 ? 'is' : 'es'}</>
                    )}
                  </p>
                </div>
                <span className="text-fm-text-secondary text-xs flex-shrink-0 ml-2" aria-hidden="true">
                  {isExpanded ? '▾' : '▸'}
                </span>
              </button>
              {isExpanded && (
                <div className="pl-3 mt-2 ml-1 border-l-2 border-fm-border space-y-3">
                  {ev.extract && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1">
                        Source quote
                      </p>
                      <pre className="text-xs bg-fm-surface-alt border border-fm-border rounded-fm-input p-2 overflow-x-auto whitespace-pre-wrap text-fm-text-primary font-mono">
                        {ev.extract}
                      </pre>
                    </div>
                  )}
                  {ev.analysis && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1">
                        Analysis
                      </p>
                      <p className="text-sm text-fm-text-primary">{ev.analysis}</p>
                    </div>
                  )}
                  {ev.related_hypotheses && ev.related_hypotheses.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-fm-text-tertiary mb-1.5">
                        Related hypotheses
                      </p>
                      <ul className="space-y-1.5">
                        {ev.related_hypotheses.map((rh) => (
                          <li key={rh.hypothesis_id} className="flex items-baseline gap-2">
                            <span className={`text-[10px] font-semibold uppercase tracking-wide ${stanceColor(rh.stance)}`}>
                              {rh.stance}
                            </span>
                            <span className="text-sm text-fm-text-primary">{rh.statement}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function FileListView({ caseId, revision }: { caseId: string; revision: string }) {
  const { data: files, loading, error, stale } = useCaseRead(caseId, revision, readFiles, 'Failed to load files');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) return <div className="text-fm-text-tertiary text-sm py-4">Loading files...</div>;
  if (error) return <div className="text-fm-critical text-sm py-4">{error}</div>;
  if (!files?.length) {
    return (
      <>
        <StaleNote stale={stale} />
        <div className="text-fm-text-tertiary text-sm py-4">No files uploaded.</div>
      </>
    );
  }

  return (
    <>
      <StaleNote stale={stale} />
      <div className="divide-y divide-fm-border">
        {files.map((file) => {
          const isExpanded = expandedId === file.file_id;
          return (
            <div key={file.file_id} className="py-2">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : file.file_id)}
                className="w-full flex items-center justify-between gap-4 text-left hover:bg-fm-elevated/40 -mx-2 px-2 py-1 rounded transition-colors"
                aria-expanded={isExpanded}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fm-text-primary truncate">{file.filename}</p>
                  <p className="text-xs text-fm-text-tertiary mt-0.5 inline-flex items-center gap-1.5">
                    <span>{file.source_type} · {file.size_display} · turn {file.uploaded_at_turn}</span>
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden="true" className={`inline-block w-1.5 h-1.5 rounded-full ${analysisStatusDotColor(file.analysis_status)}`} />
                      <span>{file.analysis_status}</span>
                    </span>
                  </p>
                </div>
                <span className="text-fm-text-secondary text-xs flex-shrink-0 ml-2" aria-hidden="true">
                  {isExpanded ? '▾' : '▸'}
                </span>
              </button>
              {isExpanded && (
                <div className="pl-2 mt-1 border-l-2 border-fm-border ml-1">
                  <FileEvidenceDetails caseId={caseId} fileId={file.file_id} revision={revision} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function EvidenceTab({ caseId, revision }: { caseId: string; revision: string }) {
  const [view, setView] = useState<'evidence' | 'files'>('evidence');

  return (
    <div>
      {view === 'evidence'
        ? <EvidenceListView caseId={caseId} revision={revision} />
        : <FileListView caseId={caseId} revision={revision} />}
      <div className="mt-4 pt-3 border-t border-fm-border">
        <button
          type="button"
          onClick={() => setView(view === 'evidence' ? 'files' : 'evidence')}
          className="text-xs text-fm-text-secondary hover:text-fm-accent transition-colors"
        >
          {view === 'evidence' ? 'View uploaded files →' : '← Back to evidence'}
        </button>
      </div>
    </div>
  );
}

function HypothesisRow({ hypothesis }: { hypothesis: HypothesisSummary }) {
  const { color, symbol } = hypothesisStatusStyle(hypothesis.state);
  const likelihoodPct = Math.round(hypothesis.likelihood * 100);
  return (
    <li className="py-2 flex items-start gap-3">
      <span className={`${color} flex-shrink-0 mt-0.5`} aria-hidden="true">{symbol}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${color}`}>
            {hypothesis.state}
          </span>
          <span className="text-xs text-fm-text-tertiary font-mono">{likelihoodPct}%</span>
          <span className="text-[10px] text-fm-text-tertiary">
            {hypothesis.evidence_count} evidence
          </span>
        </div>
        <p className="text-sm text-fm-text-primary mt-1">{hypothesis.text}</p>
      </div>
    </li>
  );
}

function HypothesesTab({ caseId, caseDetail, revision }: { caseId: string; caseDetail: CaseDetail; revision: string }) {
  const { data: hypotheses, loading, error, stale } = useCaseRead(caseId, revision, readHypotheses, 'Failed to load hypotheses');

  if (loading) return <div className="text-fm-text-tertiary text-sm py-4">Loading hypotheses...</div>;
  if (error) return <div className="text-fm-critical text-sm py-4">{error}</div>;

  if (!hypotheses || hypotheses.length === 0) {
    if (caseDetail.is_terminal && caseDetail.hypothesis_count > 0) {
      return (
        <div className="py-2 text-sm text-fm-text-secondary">
          <StaleNote stale={stale} />
          {caseDetail.hypothesis_count} hypothes{caseDetail.hypothesis_count === 1 ? 'is' : 'es'} were
          tested on this case. Detailed hypothesis history is available in case storage
          but not surfaced here for terminal cases.
        </div>
      );
    }
    return (
      <div className="py-2 text-sm text-fm-text-tertiary">
        <StaleNote stale={stale} />
        No hypotheses yet — this case hasn&apos;t produced any.
      </div>
    );
  }

  return (
    <div className="py-1">
      <StaleNote stale={stale} />
      <ul className="divide-y divide-fm-border">
        {hypotheses.map((h) => <HypothesisRow key={h.hypothesis_id} hypothesis={h} />)}
      </ul>
    </div>
  );
}

export function CaseTabs({ caseId, caseDetail, layout, readOnly, onCaseChanged }: CaseTabsProps) {
  const { surface, transcriptTabShown, viewportBounded } = layout;
  // The primitive, not the object: the page hands a new `caseDetail` on every
  // re-read, and only a change the server stamped is worth a refetch.
  const revision = caseDetail.updated_at;
  const [searchParams, setSearchParams] = useSearchParams();

  // Hypotheses are only formed when the root cause isn't immediately obvious,
  // so many cases have none. Show the tab only when the case actually produced
  // hypotheses — the count spans the full lifecycle, so terminal cases that
  // deliberated keep the tab as a record. A permanently-empty tab would just
  // train users to ignore it.
  const showHypotheses = caseDetail.hypothesis_count > 0;

  const allTabs: { id: Tab; label: string }[] = [
    { id: 'transcript', label: 'Transcript' },
    { id: 'issue', label: 'Issue' },
    { id: 'report', label: 'Report' },
    { id: 'hypotheses', label: 'Hypotheses' },
    { id: 'evidence', label: 'Evidence' },
  ];
  const tabLabels = allTabs.filter(
    (t) =>
      // Transcript is HIDDEN while the dock is showing the conversation, and
      // present whenever it is not — so exactly one surface renders the
      // conversation and "where is the transcript?" has one answer (D2).
      (t.id !== 'hypotheses' || showHypotheses) && (t.id !== 'transcript' || transcriptTabShown),
  );

  // The active tab is derived from the URL (single source of truth), so a
  // ?tab= deep link that changes on the same mounted case takes effect, and a
  // click updates the URL — keeping copied links current.
  const transcriptIsLive = surface === 'tab-live';

  const requestedTab = searchParams.get('tab') as Tab | null;

  /**
   * TOGGLING THE DOCK IS A LAYOUT GESTURE. It must not navigate the record.
   *
   * The URL is only written when a tab is CLICKED, so most of the time there is
   * no `?tab=` and the active tab comes from a default. That default has to be
   * sticky, and neither obvious spelling of it is:
   *
   *  - `tabLabels[0]` moves when Transcript enters or leaves the strip.
   *    Measured on the real page: a user reading Issue who collapsed the dock
   *    to widen the record was moved onto Transcript.
   *  - `transcriptTabShown ? 'transcript' : 'issue'` has the same defect for
   *    the same reason — it is still computed from the dock's state.
   *
   * So what is displayed is REMEMBERED. `chosen` starts at the URL's tab or
   * Transcript (the default since before #124), follows the URL whenever the
   * URL says something, and is otherwise written back from whatever was
   * actually resolved — so the one time the fallback fires, it sticks. Opening
   * or collapsing the dock then changes only whether Transcript is available,
   * never what the user is looking at.
   */
  const [chosen, setChosen] = useState<Tab>(() => requestedTab ?? 'transcript');

  // The URL wins whenever it names a tab; otherwise the last thing displayed.
  const candidate = requestedTab ?? chosen;
  const activeTab: Tab = tabLabels.some((t) => t.id === candidate)
    ? candidate
    : fallbackTab(tabLabels);

  // Written back DURING RENDER, React's documented way to adjust state from a
  // prop that has changed — not an effect, which would be a cascading render
  // the lint rejects, and would settle one frame late. This is the line that
  // makes the fallback stick: without it the default is recomputed from the
  // dock's state on every render and the toggle moves the user.
  if (activeTab !== chosen) setChosen(activeTab);

  /**
   * The revision the hidden record transcript was last SHOWN at.
   *
   * The record stays mounted behind the other tabs (see below), so handing it
   * `revision` would re-run its paged `getCaseMessages` on every turn while the
   * user reads Evidence. It follows the case only while Transcript is the
   * active tab, and catches up — one re-read — when it is shown again.
   * Adjusted during render, as `chosen` is. A move to another case (defence
   * only, as in `useCaseRead`: the page unmounts these tabs on a case change)
   * adopts that case's revision at once: the record reads it on `caseId` anyway,
   * so waiting would only buy a second read of it later. So does a record that
   * is not mounted at all (the dock open, or the tab live): it reads the case
   * as it is when it mounts, so a revision it lagged behind meanwhile would buy
   * the same second read the first time Transcript is shown.
   */
  const recordMounted = transcriptTabShown && !transcriptIsLive;
  const [transcriptAt, setTranscriptAt] = useState({ caseId, revision });
  if (
    transcriptAt.caseId !== caseId
    || ((activeTab === 'transcript' || !recordMounted) && transcriptAt.revision !== revision)
  ) {
    setTranscriptAt({ caseId, revision });
  }

  /**
   * A `?tab=` the strip cannot honour is CLEARED, not ignored.
   *
   * `?tab=` is the cross-frontend linking contract with the Copilot (see
   * CLAUDE.md), so a dropped value is a contract break rather than a cosmetic
   * one: the address bar would keep claiming `tab=transcript` while Issue was
   * rendered, and a link copied from it would resolve to something the URL does
   * not describe. That is reachable now that a tab can LEAVE the strip — open
   * the dock with `?tab=transcript` in the URL and it is gone.
   *
   * `replace`, so correcting the URL does not leave a dead entry in the back
   * stack that would bounce the user straight back to it.
   */
  useEffect(() => {
    if (!requestedTab) return;
    if (tabLabels.some((t) => t.id === requestedTab)) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('tab');
        return next;
      },
      { replace: true },
    );
  }, [requestedTab, tabLabels, setSearchParams]);

  const setActiveTab = (id: Tab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', id);
        return next;
      },
      { replace: true },
    );
  };

  const tabBtnBase = 'px-3 py-1.5 text-sm font-medium border-b-2 transition-colors';
  const tabActive = 'border-fm-accent text-fm-accent';
  const tabInactive = 'border-transparent text-fm-text-secondary hover:text-fm-text-primary';

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-shrink-0 flex border-b border-fm-border mb-3">
        {tabLabels.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`${tabBtnBase} ${activeTab === id ? tabActive : tabInactive}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* The LIVE arm only. It is not rendered at all when the tab is the
          read-only record — that is what makes case detail cost no package
          chunk, no session and no panel mount for a user whose composer is
          elsewhere (ADR-018 D2).

          The live arm OWNS its scrolling: the panel scrolls its transcript
          internally and pins its composer to the bottom, so a scroll container
          here would give it a second one and put the composer below the fold
          again.

          And when it IS rendered it is HIDDEN, not unmounted, while another tab
          shows. Unmounting the panel tears down its session, its conversation
          cache and any in-flight turn — so glancing at Evidence and coming back
          re-minted a session and re-fetched the transcript, and a turn in
          progress was lost. `hidden` costs a rendered subtree; the alternative
          costs the user's work. */}
      {transcriptIsLive && (
        <div
          className={activeTab === 'transcript' ? 'flex-1 min-h-0' : 'hidden'}
          data-testid="transcript-tab-panel"
        >
          {/* `visible` follows the ACTIVE TAB: this arm stays mounted behind
              Report or Evidence so an in-flight turn survives, but the user is
              looking at no conversation there, so the extension's panel should
              come back. */}
          <CasePanelMount
            caseId={caseId}
            readOnly={readOnly}
            visible={activeTab === 'transcript'}
            onCaseChanged={onCaseChanged}
          />
        </div>
      )}
      {/* Record content — long-form, with no scroller of its own, so it gets
          one here; without it the viewport-bounded page would simply clip it.
          The read-only transcript belongs in this container and not in the
          live arm's: it is read, like the report and the evidence beside it. */}
      {!(activeTab === 'transcript' && transcriptIsLive) && (
        // A SCROLLER ONLY WHERE THE PAGE IS BOUNDED. Bounding exists to keep a
        // composer above the fold, so on a page with no composer at all the
        // record is long-form content and the PAGE scrolls, as it did before
        // #124. Keeping this scroller there would squeeze a transcript, a
        // report and an evidence list into an inner box a few hundred pixels
        // tall while the window below it sat empty.
        <div className={viewportBounded ? 'flex-1 min-h-0 overflow-y-auto' : 'flex-1'}>
          {/* HIDDEN, not unmounted, for the same reason the live arm is: the
              effect is torn down on unmount, so a glance at Evidence and back
              re-ran `getCaseMessages` from scratch — and it PAGES at 100
              messages a request, so a long case cost several sequential round
              trips and a "Loading transcript…" flash on every visit. The cost
              of keeping it is one rendered subtree. */}
          {recordMounted && (
            <div className={activeTab === 'transcript' ? undefined : 'hidden'}>
              <RecordTranscriptTab caseId={caseId} revision={transcriptAt.revision} />
            </div>
          )}
          {activeTab === 'issue' && <IssueTab caseDetail={caseDetail} />}
          {activeTab === 'report' && <ReportTab caseId={caseId} caseDetail={caseDetail} />}
          {activeTab === 'hypotheses' && <HypothesesTab caseId={caseId} caseDetail={caseDetail} revision={revision} />}
          {activeTab === 'evidence' && <EvidenceTab caseId={caseId} revision={revision} />}
        </div>
      )}
    </div>
  );
}
