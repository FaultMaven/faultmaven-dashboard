import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getCaseReports, getCaseReportDownloadUrl } from '../lib/api';
import type { CaseReport, CaseDetail, ReportType } from '../types/cases';
import config from '../config';

const REPORT_TYPE_META: Record<ReportType, { label: string }> = {
  resolution_summary: { label: 'Resolution Summary' },
  closure_summary: { label: 'Closure Summary' },
  runbook: { label: 'Runbook' },
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
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
      setReports(data);
      // Auto-select the first report if available
      if (data.length > 0 && !selectedReport) {
        setSelectedReport(data[0]);
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
                Generated {relativeTime(selectedReport.created_at)}
              </p>
            </div>
            <a
              href={`${config.apiUrl}${getCaseReportDownloadUrl(caseId, selectedReport.report_id)}`}
              download
              className="text-xs text-fm-accent hover:underline"
            >
              Download
            </a>
          </div>

          <div className="bg-fm-surface-alt border border-fm-border rounded-fm-card p-4">
            <div className={proseClasses}>
              <Markdown remarkPlugins={[remarkGfm]}>
                {selectedReport.content}
              </Markdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
