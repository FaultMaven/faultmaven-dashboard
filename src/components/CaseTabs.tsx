import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getCaseMessages, getCaseEvidence } from '../lib/api';
import type { CaseDetail, CaseMessage, CaseEvidenceFile } from '../types/cases';
import { ReportTab } from './ReportTab';
import { IssueTab } from './IssueTab';

type Tab = 'transcript' | 'evidence' | 'hypotheses' | 'report' | 'issue';

interface ResolutionNotesProps {
  notes: string;
  onChange: (notes: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  error: string | null;
  disabled: boolean;
}

interface CaseTabsProps {
  caseId: string;
  caseDetail: CaseDetail;
  resolutionNotes?: ResolutionNotesProps;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const transcriptProseClasses = `prose prose-sm prose-invert max-w-none
  prose-headings:text-fm-text-primary prose-headings:font-semibold
  prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
  prose-p:text-fm-text-primary prose-p:leading-relaxed prose-p:my-1
  prose-li:text-fm-text-primary prose-li:my-0
  prose-ul:my-1 prose-ol:my-1
  prose-strong:text-fm-text-primary
  prose-code:text-fm-text-primary prose-code:bg-fm-elevated prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal
  prose-pre:bg-fm-surface-alt prose-pre:border prose-pre:border-fm-border prose-pre:rounded-fm-input prose-pre:my-2
  prose-a:text-fm-accent prose-a:no-underline hover:prose-a:underline
  prose-table:text-sm prose-th:text-fm-text-primary prose-td:text-fm-text-secondary
  prose-hr:border-fm-border`;

function TranscriptTab({ caseId }: { caseId: string }) {
  const [messages, setMessages] = useState<CaseMessage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getCaseMessages(caseId);
        if (!cancelled) setMessages(res.messages);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load transcript');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [caseId]);

  if (loading) return <div className="text-fm-text-tertiary text-sm py-4">Loading transcript...</div>;
  if (error) return <div className="text-fm-critical text-sm py-4">{error}</div>;
  if (!messages?.length) return <div className="text-fm-text-tertiary text-sm py-4">No messages yet.</div>;

  return (
    <div className="space-y-4 py-2">
      {messages.map((msg) => (
        <div key={msg.message_id} className={`flex gap-3 ${msg.role === 'assistant' ? 'flex-row-reverse' : ''}`}>
          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-fm-elevated text-fm-text-secondary">
            {msg.role === 'user' ? 'U' : 'FM'}
          </div>
          <div
            className={`max-w-2xl px-4 py-2 rounded-fm-card text-sm ${
              msg.role === 'assistant' ? 'bg-fm-accent/10 border border-fm-accent/20' : 'bg-fm-surface border border-fm-border'
            }`}
          >
            <div className={transcriptProseClasses}>
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{ a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
              >
                {msg.content}
              </Markdown>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EvidenceTab({ caseId }: { caseId: string }) {
  const [files, setFiles] = useState<CaseEvidenceFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getCaseEvidence(caseId);
        if (!cancelled) setFiles(res.files);
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

export function CaseTabs({ caseId, caseDetail, resolutionNotes }: CaseTabsProps) {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'transcript';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const tabLabels: { id: Tab; label: string }[] = [
    { id: 'transcript', label: 'Transcript' },
    { id: 'issue', label: 'Issue' },
    { id: 'report', label: 'Report' },
    { id: 'hypotheses', label: 'Hypotheses' },
    { id: 'evidence', label: 'Evidence' },
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
      {activeTab === 'issue' && <IssueTab caseDetail={caseDetail} resolutionNotes={resolutionNotes} />}
      {activeTab === 'report' && <ReportTab caseId={caseId} caseDetail={caseDetail} />}
      {activeTab === 'hypotheses' && <HypothesesTab caseDetail={caseDetail} />}
      {activeTab === 'evidence' && <EvidenceTab caseId={caseId} />}
    </div>
  );
}
