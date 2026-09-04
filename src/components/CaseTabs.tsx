import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getUploadedFiles,
  getUploadedFileDetails,
  getCaseEvidenceList,
  getCaseUI,
} from '../lib/api';
import type {
  CaseDetail,
  UploadedFile,
  UploadedFileDetails,
  EvidenceDetails,
  HypothesisState,
  HypothesisSummary,
} from '../types/cases';
import { ReportTab } from './ReportTab';
import { IssueTab } from './IssueTab';
import CopilotPanelMount from '../copilot/CopilotPanelMount';

type Tab = 'transcript' | 'evidence' | 'hypotheses' | 'report' | 'issue';

interface CaseTabsProps {
  caseId: string;
  caseDetail: CaseDetail;
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
    case 'captured':
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
 * The transcript, and the input that continues it.
 *
 * This tab used to render `TranscriptView`, a read-only copy of a conversation
 * the extension rendered a second time and differently — the drift ADR-016 D1
 * retires. It now mounts the shared Copilot UI on this case: one renderer, and
 * the Dashboard can continue an investigation rather than only review one.
 *
 * The panel loads its own messages; nothing is fetched here. A turn taken here
 * and a turn taken in the extension are the same rows on the same server, so
 * neither host needs the other and each sees the other's work on reload.
 */
function TranscriptTab({ caseId }: { caseId: string }) {
  return (
    <div className="h-[70vh] min-h-[28rem]">
      <CopilotPanelMount caseId={caseId} />
    </div>
  );
}

function FileEvidenceDetails({ caseId, fileId }: { caseId: string; fileId: string }) {
  const [details, setDetails] = useState<UploadedFileDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getUploadedFileDetails(caseId, fileId);
        if (!cancelled) setDetails(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load details');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [caseId, fileId]);

  if (loading) return <div className="text-fm-text-tertiary text-xs py-2 italic">Loading derived evidence...</div>;
  if (error) return <div className="text-fm-critical text-xs py-2">{error}</div>;
  if (!details) return null;

  const evidence = details.derived_evidence ?? [];

  return (
    <div className="py-2 space-y-3">
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

function EvidenceListView({ caseId }: { caseId: string }) {
  const [evidence, setEvidence] = useState<EvidenceDetails[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getCaseEvidenceList(caseId);
        if (!cancelled) setEvidence(res.evidence);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load evidence');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [caseId]);

  if (loading) return <div className="text-fm-text-tertiary text-sm py-4">Loading evidence...</div>;
  if (error) return <div className="text-fm-critical text-sm py-4">{error}</div>;
  if (!evidence?.length) {
    return <div className="text-fm-text-tertiary text-sm py-4">No evidence collected yet.</div>;
  }

  return (
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
  );
}

function FileListView({ caseId }: { caseId: string }) {
  const [files, setFiles] = useState<UploadedFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getUploadedFiles(caseId);
        if (!cancelled) setFiles(res.files);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load files');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [caseId]);

  if (loading) return <div className="text-fm-text-tertiary text-sm py-4">Loading files...</div>;
  if (error) return <div className="text-fm-critical text-sm py-4">{error}</div>;
  if (!files?.length) return <div className="text-fm-text-tertiary text-sm py-4">No files uploaded.</div>;

  return (
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
                <FileEvidenceDetails caseId={caseId} fileId={file.file_id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EvidenceTab({ caseId }: { caseId: string }) {
  const [view, setView] = useState<'evidence' | 'files'>('evidence');

  return (
    <div>
      {view === 'evidence' ? <EvidenceListView caseId={caseId} /> : <FileListView caseId={caseId} />}
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

function HypothesesTab({ caseId, caseDetail }: { caseId: string; caseDetail: CaseDetail }) {
  const [hypotheses, setHypotheses] = useState<HypothesisSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const ui = await getCaseUI(caseId);
        if (!cancelled) setHypotheses(ui.active_hypotheses ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load hypotheses');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [caseId]);

  if (loading) return <div className="text-fm-text-tertiary text-sm py-4">Loading hypotheses...</div>;
  if (error) return <div className="text-fm-critical text-sm py-4">{error}</div>;

  if (!hypotheses || hypotheses.length === 0) {
    if (caseDetail.is_terminal && caseDetail.hypothesis_count > 0) {
      return (
        <div className="py-2 text-sm text-fm-text-secondary">
          {caseDetail.hypothesis_count} hypothes{caseDetail.hypothesis_count === 1 ? 'is' : 'es'} were
          tested during this investigation. Detailed hypothesis history is available in case storage
          but not surfaced here for terminal cases.
        </div>
      );
    }
    return (
      <div className="py-2 text-sm text-fm-text-tertiary">
        No hypotheses yet — investigation hasn&apos;t produced any.
      </div>
    );
  }

  return (
    <div className="py-1">
      <ul className="divide-y divide-fm-border">
        {hypotheses.map((h) => <HypothesisRow key={h.hypothesis_id} hypothesis={h} />)}
      </ul>
    </div>
  );
}

export function CaseTabs({ caseId, caseDetail }: CaseTabsProps) {
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
  const tabLabels = allTabs.filter((t) => t.id !== 'hypotheses' || showHypotheses);

  // The active tab is derived from the URL (single source of truth), so a
  // ?tab= deep link that changes on the same mounted case takes effect, and a
  // click updates the URL — keeping copied links current. A deep link to a tab
  // that isn't visible (e.g. ?tab=hypotheses on a case with none) or an unknown
  // value falls back to Transcript rather than rendering a blank panel.
  const requestedTab = searchParams.get('tab') as Tab | null;
  const activeTab: Tab = tabLabels.some((t) => t.id === requestedTab)
    ? (requestedTab as Tab)
    : 'transcript';

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
    <div>
      <div className="flex border-b border-fm-border mb-3">
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

      {activeTab === 'transcript' && <TranscriptTab caseId={caseId} />}
      {activeTab === 'issue' && <IssueTab caseDetail={caseDetail} />}
      {activeTab === 'report' && <ReportTab caseId={caseId} caseDetail={caseDetail} />}
      {activeTab === 'hypotheses' && <HypothesesTab caseId={caseId} caseDetail={caseDetail} />}
      {activeTab === 'evidence' && <EvidenceTab caseId={caseId} />}
    </div>
  );
}
