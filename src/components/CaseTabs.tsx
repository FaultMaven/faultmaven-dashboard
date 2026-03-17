import { useState } from 'react';
import { getCaseMessages, getCaseEvidence, getCaseReports, getCaseReportDownloadUrl } from '../lib/api';
import type { CaseDetail, CaseMessage, CaseEvidenceFile, CaseReport } from '../types/cases';
import config from '../config';

type Tab = 'transcript' | 'evidence' | 'hypotheses' | 'report';

interface CaseTabsProps {
  caseId: string;
  caseDetail: CaseDetail;
}

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: 'transcript', label: 'Transcript' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'hypotheses', label: 'Hypotheses' },
  { id: 'report', label: 'Report' },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TranscriptTab({ caseId }: { caseId: string }) {
  const [messages, setMessages] = useState<CaseMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (messages !== null) return;
    setLoading(true);
    try {
      const res = await getCaseMessages(caseId);
      setMessages(res.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transcript');
    } finally {
      setLoading(false);
    }
  };

  if (messages === null && !loading && !error) {
    load();
    return <div className="text-fm-text-tertiary text-sm py-4">Loading transcript...</div>;
  }
  if (loading) return <div className="text-fm-text-tertiary text-sm py-4">Loading transcript...</div>;
  if (error) return <div className="text-fm-critical text-sm py-4">{error}</div>;
  if (!messages?.length) return <div className="text-fm-text-tertiary text-sm py-4">No messages yet.</div>;

  return (
    <div className="space-y-4 py-2">
      {messages.map((msg) => (
        <div key={msg.message_id} className={`flex gap-3 ${msg.role === 'assistant' ? 'flex-row-reverse' : ''}`}>
          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-fm-elevated text-fm-text-secondary">
            {msg.role === 'user' ? 'U' : 'AI'}
          </div>
          <div
            className={`max-w-2xl px-4 py-2 rounded-fm-card text-sm text-fm-text-primary whitespace-pre-wrap ${
              msg.role === 'assistant' ? 'bg-fm-accent/10 border border-fm-accent/20' : 'bg-fm-surface border border-fm-border'
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}
    </div>
  );
}

function EvidenceTab({ caseId }: { caseId: string }) {
  const [files, setFiles] = useState<CaseEvidenceFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (files !== null) return;
    setLoading(true);
    try {
      const res = await getCaseEvidence(caseId);
      setFiles(res.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load evidence');
    } finally {
      setLoading(false);
    }
  };

  if (files === null && !loading && !error) {
    load();
    return <div className="text-fm-text-tertiary text-sm py-4">Loading evidence...</div>;
  }
  if (loading) return <div className="text-fm-text-tertiary text-sm py-4">Loading evidence...</div>;
  if (error) return <div className="text-fm-critical text-sm py-4">{error}</div>;
  if (!files?.length) return <div className="text-fm-text-tertiary text-sm py-4">No evidence files uploaded.</div>;

  return (
    <div className="divide-y divide-fm-border">
      {files.map((file) => (
        <div key={file.data_id} className="py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-fm-text-primary">{file.filename}</p>
            <p className="text-xs text-fm-text-tertiary mt-0.5">
              {file.file_type} · {formatBytes(file.file_size)} · {new Date(file.uploaded_at).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function HypothesesTab({ caseDetail }: { caseDetail: CaseDetail }) {
  return (
    <div className="py-2">
      <p className="text-sm text-fm-text-secondary">
        {caseDetail.hypothesis_count} hypothesis{caseDetail.hypothesis_count !== 1 ? 'es' : ''} generated.
      </p>
      {caseDetail.hypothesis_count === 0 && (
        <p className="text-fm-text-tertiary text-sm mt-2">No hypotheses yet — investigation in progress.</p>
      )}
    </div>
  );
}

function ReportTab({ caseId }: { caseId: string }) {
  const [reports, setReports] = useState<CaseReport[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (reports !== null) return;
    setLoading(true);
    try {
      const res = await getCaseReports(caseId);
      setReports(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  if (reports === null && !loading && !error) {
    load();
    return <div className="text-fm-text-tertiary text-sm py-4">Loading reports...</div>;
  }
  if (loading) return <div className="text-fm-text-tertiary text-sm py-4">Loading reports...</div>;
  if (error) return <div className="text-fm-critical text-sm py-4">{error}</div>;
  if (!reports?.length) return <div className="text-fm-text-tertiary text-sm py-4">No reports generated yet.</div>;

  return (
    <div className="space-y-4 py-2">
      {reports.map((report) => (
        <div key={report.report_id} className="bg-fm-surface border border-fm-border rounded-fm-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-fm-text-primary capitalize">
              {report.report_type.replace(/_/g, ' ')} — {new Date(report.created_at).toLocaleDateString()}
            </p>
            <a
              href={`${config.apiUrl}${getCaseReportDownloadUrl(caseId, report.report_id)}`}
              download
              className="text-xs text-fm-accent hover:underline"
            >
              Download
            </a>
          </div>
          <pre className="text-xs text-fm-text-secondary whitespace-pre-wrap font-mono overflow-auto max-h-64">
            {report.content}
          </pre>
        </div>
      ))}
    </div>
  );
}

export function CaseTabs({ caseId, caseDetail }: CaseTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('transcript');

  const tabBtnBase = 'px-4 py-2 text-sm font-medium border-b-2 transition-colors';
  const tabActive = 'border-fm-accent text-fm-accent';
  const tabInactive = 'border-transparent text-fm-text-secondary hover:text-fm-text-primary';

  return (
    <div>
      <div className="flex border-b border-fm-border mb-4">
        {TAB_LABELS.map(({ id, label }) => (
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
      {activeTab === 'evidence' && <EvidenceTab caseId={caseId} />}
      {activeTab === 'hypotheses' && <HypothesesTab caseDetail={caseDetail} />}
      {activeTab === 'report' && <ReportTab caseId={caseId} />}
    </div>
  );
}
