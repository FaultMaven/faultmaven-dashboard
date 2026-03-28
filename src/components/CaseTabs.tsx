import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCaseMessages, getCaseEvidence } from '../lib/api';
import type { CaseDetail, CaseMessage, CaseEvidenceFile } from '../types/cases';
import { ReportTab } from './ReportTab';
import { KnowledgeTab } from './KnowledgeTab';
import { IssueTab } from './IssueTab';
import { RunbookTab } from './RunbookTab';

type Tab = 'transcript' | 'evidence' | 'hypotheses' | 'report' | 'issue' | 'runbook' | 'knowledge';

interface CaseTabsProps {
  caseId: string;
  caseDetail: CaseDetail;
}

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

export function CaseTabs({ caseId, caseDetail }: CaseTabsProps) {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'transcript';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const tabLabels: { id: Tab; label: string }[] = [
    { id: 'transcript', label: 'Transcript' },
    { id: 'evidence', label: 'Evidence' },
    { id: 'hypotheses', label: 'Hypotheses' },
    { id: 'report', label: 'Report' },
    ...(caseDetail.status === 'resolved' ? [
      { id: 'issue' as Tab, label: 'Issue' },
      { id: 'runbook' as Tab, label: 'Runbook' },
    ] : []),
    ...(caseDetail.is_terminal ? [{ id: 'knowledge' as Tab, label: 'Knowledge' }] : []),
  ];

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
      {activeTab === 'evidence' && <EvidenceTab caseId={caseId} />}
      {activeTab === 'hypotheses' && <HypothesesTab caseDetail={caseDetail} />}
      {activeTab === 'report' && <ReportTab caseId={caseId} caseDetail={caseDetail} />}
      {activeTab === 'issue' && <IssueTab caseDetail={caseDetail} />}
      {activeTab === 'runbook' && <RunbookTab caseId={caseId} caseDetail={caseDetail} />}
      {activeTab === 'knowledge' && <KnowledgeTab caseId={caseId} caseDetail={caseDetail} />}
    </div>
  );
}
