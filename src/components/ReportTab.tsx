import { useState, useEffect, useRef } from 'react';
import {
  getCaseReports,
  generateCaseReport,
  getReportRecommendations,
  getCaseReportDownloadUrl,
} from '../lib/api';
import type {
  CaseReport,
  CaseDetail,
  ReportType,
  ReportRecommendation,
} from '../types/cases';
import config from '../config';

const REPORT_TYPE_META: Record<ReportType, { icon: string; label: string }> = {
  incident_report: { icon: '\u{1F4CB}', label: 'Incident Report' },
  post_mortem: { icon: '\u{1F4D8}', label: 'Post Mortem' },
  runbook: { icon: '\u{1F501}', label: 'Runbook' },
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
  const [recommendation, setRecommendation] = useState<ReportRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<ReportType | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<CaseReport | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const isTerminal = caseDetail.is_terminal;
  const status = caseDetail.status;

  useEffect(() => {
    if (!isTerminal) return;
    loadData();
  }, [caseId, isTerminal]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [reportsData, recData] = await Promise.all([
        getCaseReports(caseId),
        getReportRecommendations(caseId).catch(() => null),
      ]);
      setReports(reportsData);
      setRecommendation(recData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate(type: ReportType) {
    setGenerating(type);
    setGenerateError(null);
    try {
      await generateCaseReport(caseId, { report_types: [type] });
      await loadData();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(null);
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
        Reports will be available after the case is resolved or closed.
      </div>
    );
  }

  if (loading) {
    return <div className="text-fm-text-tertiary text-sm py-4">Loading reports...</div>;
  }

  if (error) {
    return <div className="text-fm-critical text-sm py-4">{error}</div>;
  }

  const availableTypes: ReportType[] =
    status === 'resolved'
      ? ['incident_report', 'post_mortem', 'runbook']
      : ['incident_report'];

  function getReportForType(type: ReportType): CaseReport | undefined {
    return reports.find((r) => r.report_type === type);
  }

  const reportsOfType = (type: ReportType) =>
    reports.filter((r) => r.report_type === type);

  return (
    <div className="py-2">
      {/* Report Type Cards */}
      <div className="flex gap-4">
        {availableTypes.map((type) => {
          const meta = REPORT_TYPE_META[type];
          const existing = getReportForType(type);
          const allOfType = reportsOfType(type);
          const version = allOfType.length;
          const isGenerating = generating === type;
          const hasRunbookRec =
            type === 'runbook' &&
            recommendation?.runbook_recommendation?.action !== 'generate' &&
            !existing;

          return (
            <div
              key={type}
              className="bg-fm-surface-alt border border-fm-border rounded-fm-card p-4 flex flex-col items-center text-center min-w-0 flex-1"
            >
              <span className="text-2xl mb-2">{meta.icon}</span>
              <p className="text-sm font-medium text-fm-text-primary mb-2">{meta.label}</p>

              {existing ? (
                <>
                  <p className="text-xs text-fm-success font-medium">Generated</p>
                  <p className="text-xs text-fm-text-tertiary mt-0.5">
                    v{version} &middot; {relativeTime(existing.created_at)}
                  </p>
                  <button
                    onClick={() => handleView(existing)}
                    className="mt-3 text-xs text-fm-accent hover:underline cursor-pointer"
                  >
                    View
                  </button>
                </>
              ) : hasRunbookRec ? (
                <>
                  <p className="text-xs text-fm-info font-medium">Recommended</p>
                  <button
                    onClick={() =>
                      previewRef.current?.scrollIntoView({ behavior: 'smooth' })
                    }
                    className="mt-3 text-xs text-fm-accent hover:underline cursor-pointer"
                  >
                    Review
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-fm-text-tertiary">Not yet</p>
                  <button
                    onClick={() => handleGenerate(type)}
                    disabled={isGenerating}
                    className={`mt-3 bg-fm-accent text-white rounded-fm-btn px-3 py-1.5 text-xs font-medium hover:brightness-110 transition-colors ${
                      isGenerating ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isGenerating ? 'Generating...' : 'Generate'}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {generateError && (
        <p className="text-fm-critical text-xs mt-2">{generateError}</p>
      )}

      {/* Runbook Recommendation Panel */}
      {recommendation &&
        recommendation.runbook_recommendation.action !== 'generate' &&
        recommendation.runbook_recommendation.existing_runbook && (
          <div className="bg-fm-info/5 border border-fm-info/20 rounded-fm-card p-4 mt-4">
            <div className="flex items-start gap-2">
              <span className="text-fm-info font-bold text-sm">i</span>
              <div className="flex-1">
                <p className="text-sm text-fm-text-primary font-medium">
                  Similar runbook found
                  {recommendation.runbook_recommendation.similarity_score != null && (
                    <span className="text-fm-text-tertiary font-normal">
                      {' '}
                      ({Math.round(recommendation.runbook_recommendation.similarity_score * 100)}%
                      match)
                    </span>
                  )}
                </p>
                <p className="text-sm text-fm-text-secondary mt-1">
                  &ldquo;
                  {recommendation.runbook_recommendation.existing_runbook.report_type.replace(
                    /_/g,
                    ' '
                  )}
                  &rdquo;
                </p>
                <p className="text-xs text-fm-text-tertiary mt-0.5">
                  {recommendation.runbook_recommendation.reason}
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() =>
                      handleView(recommendation.runbook_recommendation.existing_runbook!)
                    }
                    className="bg-fm-accent text-white rounded-fm-btn px-3 py-1.5 text-xs font-medium hover:brightness-110 transition-colors"
                  >
                    Update Existing
                  </button>
                  <button
                    onClick={() => handleGenerate('runbook')}
                    disabled={generating === 'runbook'}
                    className={`border border-fm-border text-fm-text-primary rounded-fm-btn px-3 py-1.5 text-xs font-medium hover:bg-fm-elevated transition-colors ${
                      generating === 'runbook' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {generating === 'runbook' ? 'Generating...' : 'Create New Runbook Anyway'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Report Preview */}
      {selectedReport && (
        <div ref={previewRef} className="bg-fm-surface border border-fm-border rounded-fm-card p-6 mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-fm-text-primary">
              Generated Report: {selectedReport.report_type.replace(/_/g, ' ')}
            </p>
            <button
              onClick={() => setSelectedReport(null)}
              className="text-xs text-fm-text-tertiary hover:text-fm-text-primary"
            >
              Close
            </button>
          </div>
          <p className="text-xs text-fm-text-tertiary mb-3">
            Generated {relativeTime(selectedReport.created_at)}
          </p>

          <div className="bg-fm-surface-alt border border-fm-border rounded-fm-card p-4 max-h-96 overflow-auto">
            <pre className="whitespace-pre-wrap font-mono text-xs text-fm-text-secondary">
              {selectedReport.content}
            </pre>
          </div>

          <div className="flex gap-3 mt-4">
            <a
              href={`${config.apiUrl}${getCaseReportDownloadUrl(caseId, selectedReport.report_id)}`}
              download
              className="border border-fm-border text-fm-text-primary rounded-fm-btn px-3 py-1.5 text-xs font-medium hover:bg-fm-elevated transition-colors inline-flex items-center gap-1"
            >
              Download
            </a>
            <button
              onClick={() => handleGenerate(selectedReport.report_type as ReportType)}
              disabled={generating !== null}
              className={`border border-fm-border text-fm-text-primary rounded-fm-btn px-3 py-1.5 text-xs font-medium hover:bg-fm-elevated transition-colors ${
                generating !== null ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {generating === selectedReport.report_type ? 'Regenerating...' : 'Regenerate'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
