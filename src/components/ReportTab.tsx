import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { prepareMarkdown } from '../lib/markdownUtils';
import { getCaseReports, getCaseReportDownloadUrl } from '../lib/api';
import { makeAuthenticatedRequest } from '../lib/knowledge/client';
import type { CaseReport, CaseDetail, ReportType } from '../types/cases';
import config from '../config';

const REPORT_TYPE_META: Record<ReportType, { label: string }> = {
  resolution_summary: { label: 'Resolution Summary' },
  closure_summary: { label: 'Closure Summary' },
  runbook: { label: 'Runbook' },
};

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
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<CaseReport | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const isTerminal = caseDetail.is_terminal;

  useEffect(() => {
    if (!isTerminal) return;
    loadReports({ initial: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, isTerminal]);

  async function loadReports(opts: { initial?: boolean } = {}) {
    if (opts.initial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const data = await getCaseReports(caseId);
      setReports(data);
      // Reconcile selection across refreshes. After a regeneration, the
      // server returns the new is_current=1 row(s); the previously
      // selected row is now is_current=0 and no longer in the response.
      // Keep the user on the same report_type (the one they were
      // viewing) when possible, otherwise default to the first row.
      if (data.length > 0) {
        const stillPresent = selectedReport
          ? data.find((r) => r.report_id === selectedReport.report_id)
          : null;
        if (stillPresent) {
          // Same row still current; no change.
        } else if (selectedReport) {
          // Selection's report_id is gone (regenerated). Pick the new
          // current row of the same report_type if one exists.
          const sameType = data.find(
            (r) => r.report_type === selectedReport.report_type,
          );
          setSelectedReport(sameType ?? data[0]);
        } else {
          setSelectedReport(data[0]);
        }
      } else {
        setSelectedReport(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleView(report: CaseReport) {
    setSelectedReport(report);
    setTimeout(() => {
      previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

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

  if (reports.length === 0) {
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
      {/* Report list */}
      {reports.length > 1 && (
        <div className="flex gap-2 mb-3">
          {reports.map((report) => {
            const meta = REPORT_TYPE_META[report.report_type as ReportType];
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
            <div className="flex items-center gap-3">
              <button
                onClick={() => loadReports()}
                disabled={refreshing}
                aria-label="Refresh report"
                title="Re-fetch the latest report (e.g. after regenerating from the Copilot)"
                className="text-xs text-fm-accent hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
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
