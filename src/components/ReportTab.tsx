import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { prepareMarkdown } from '../lib/markdownUtils';
import { getCaseReports, getCaseReportDownloadUrl } from '../lib/api';
import { makeAuthenticatedRequest } from '../lib/knowledge/client';
import type { CaseReport, CaseDetail } from '../types/cases';
import config from '../config';

// Labels for the summary tabs displayed inside the Report tab. Runbooks
// are intentionally excluded — they're a knowledge artifact derived FROM
// the case, not a report ABOUT the case, and their authoritative home is
// the KB Drafts editor. The Report tab surfaces a banner with a link to
// KB Drafts instead of duplicating runbook content here.
const SUMMARY_TYPE_META: Record<'resolution_summary' | 'closure_summary', { label: string }> = {
  resolution_summary: { label: 'Resolution Summary' },
  closure_summary: { label: 'Closure Summary' },
};

function isSummary(report: CaseReport): boolean {
  return (
    report.report_type === 'resolution_summary' ||
    report.report_type === 'closure_summary'
  );
}

function relativeTime(dateStr: string | undefined): string {
  if (!dateStr) return 'unknown';
  const ts = new Date(dateStr).getTime();
  if (isNaN(ts)) return 'unknown';
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface ReportTabProps {
  caseId: string;
  caseDetail: CaseDetail;
}

export function ReportTab({ caseId, caseDetail }: ReportTabProps) {
  // Summary rows only (resolution_summary | closure_summary). Runbooks
  // are tracked separately and surfaced via the KB-link banner instead
  // of being rendered as a tab here.
  const [summaries, setSummaries] = useState<CaseReport[]>([]);
  const [runbookCount, setRunbookCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<CaseReport | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const isTerminal = caseDetail.is_terminal;

  useEffect(() => {
    if (!isTerminal) return;
    loadReports();
  }, [caseId, isTerminal]);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      const data = await getCaseReports(caseId);
      const summaryRows = data.filter(isSummary);
      const runbookRows = data.filter((r) => r.report_type === 'runbook');
      setSummaries(summaryRows);
      setRunbookCount(runbookRows.length);
      // Auto-select the first summary if available. Runbooks never get
      // selected here — they don't render in this tab.
      if (summaryRows.length > 0 && !selectedReport) {
        setSelectedReport(summaryRows[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }

  function handleView(report: CaseReport) {
    setSelectedReport(report);
    setTimeout(() => {
      previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  // Deep-link target for the runbook banner. ``case=<id>`` lets the KB
  // page filter the Drafts list to runbooks generated from this case
  // (other drafts come from document conversion or manual creation, so
  // the filter narrows what's relevant).
  const runbookBanner = runbookCount > 0 && (
    <div className="mb-3 flex items-center justify-between gap-3 px-3 py-2 rounded-fm-input border border-fm-border bg-fm-surface-alt">
      <div className="flex items-center gap-2 text-sm text-fm-text-secondary">
        <span aria-hidden="true">📘</span>
        <span>
          {runbookCount === 1
            ? 'A runbook draft was generated from this case.'
            : `${runbookCount} runbook drafts were generated from this case.`}
        </span>
      </div>
      <Link
        to={`/kb?tab=drafts&case=${encodeURIComponent(caseId)}`}
        className="text-xs text-fm-accent hover:underline whitespace-nowrap"
      >
        Open in KB →
      </Link>
    </div>
  );

  if (!isTerminal) {
    return (
      <div className="text-fm-text-tertiary text-sm py-4">
        Reports are auto-generated when the case is resolved or closed.
      </div>
    );
  }

  if (loading) {
    return <div className="text-fm-text-tertiary text-sm py-4">Loading reports...</div>;
  }

  if (error) {
    return <div className="text-fm-critical text-sm py-4">{error}</div>;
  }

  // Empty state handling:
  //   - No summary AND no runbook → "no reports generated" (trivial case)
  //   - No summary BUT a runbook exists → show the banner only; do not
  //     emit a misleading "no reports" message, because something WAS
  //     generated (it just doesn't live in this tab).
  if (summaries.length === 0) {
    if (runbookCount > 0) {
      return <div className="py-1">{runbookBanner}</div>;
    }
    return (
      <div className="text-fm-text-tertiary text-sm py-4">
        No reports were generated for this case. This can happen for trivial cases with minimal investigation data.
      </div>
    );
  }

  const proseClasses = `prose prose-sm prose-invert max-w-none max-h-[32rem] overflow-y-auto
    prose-headings:text-fm-text-primary prose-headings:font-semibold
    prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
    prose-p:text-fm-text-secondary prose-p:leading-relaxed
    prose-li:text-fm-text-secondary
    prose-strong:text-fm-text-primary
    prose-code:text-fm-text-primary prose-code:bg-fm-elevated prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal
    prose-pre:bg-fm-surface-alt prose-pre:border prose-pre:border-fm-border prose-pre:rounded-fm-input
    prose-a:text-fm-accent prose-a:no-underline hover:prose-a:underline
    prose-table:text-sm prose-th:text-fm-text-primary prose-td:text-fm-text-secondary
    prose-hr:border-fm-border`;

  return (
    <div className="py-1">
      {runbookBanner}

      {/* Summary tabs — only shown when more than one summary exists.
          In practice a case has at most one summary (resolution OR
          closure, not both), so this branch rarely fires; the guard
          stays for safety against legacy / odd cases. */}
      {summaries.length > 1 && (
        <div className="flex gap-2 mb-3">
          {summaries.map((report) => {
            const meta =
              report.report_type === 'resolution_summary' ||
              report.report_type === 'closure_summary'
                ? SUMMARY_TYPE_META[report.report_type]
                : undefined;
            const isActive = selectedReport?.report_id === report.report_id;
            return (
              <button
                key={report.report_id}
                onClick={() => handleView(report)}
                className={`px-3 py-1.5 text-xs font-medium rounded-fm-btn border transition-colors ${
                  isActive
                    ? 'border-fm-accent text-fm-accent bg-fm-accent/10'
                    : 'border-fm-border text-fm-text-secondary hover:text-fm-text-primary hover:bg-fm-elevated'
                }`}
              >
                {meta?.label || report.report_type.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>
      )}

      {/* Report content */}
      {selectedReport && (
        <div ref={previewRef}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <p className="text-xs text-fm-text-tertiary">
                Generated {relativeTime(selectedReport.generated_at)}
              </p>
            </div>
            <button
              onClick={async () => {
                const url = `${config.apiUrl}${getCaseReportDownloadUrl(caseId, selectedReport.report_id)}`;
                const res = await makeAuthenticatedRequest(url);
                if (!res.ok) return;
                const blob = await res.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${selectedReport.report_type}_${caseId}.md`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
              className="text-xs text-fm-accent hover:underline cursor-pointer"
            >
              Download
            </button>
          </div>

          <div className="bg-fm-surface-alt border border-fm-border rounded-fm-card p-4">
            <div className={proseClasses}>
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{ a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
              >
                {prepareMarkdown(selectedReport.content)}
              </Markdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
