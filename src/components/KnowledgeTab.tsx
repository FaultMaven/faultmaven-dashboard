import { useState, useEffect } from 'react';
import {
  extractKnowledge,
  getCaseSuggestion,
  approveSuggestion,
  rejectSuggestion,
  updateSuggestion,
  remediatePII,
} from '../lib/api';
import type { CaseDetail, KnowledgeSuggestion, SuggestionStatus, PIIScanStatus } from '../types/cases';

interface KnowledgeTabProps {
  caseId: string;
  caseDetail: CaseDetail;
}

const STATUS_BADGE_CLASSES: Record<SuggestionStatus, string> = {
  pending_review: 'bg-fm-warning/10 text-fm-warning border border-fm-warning/30',
  approved: 'bg-fm-success/10 text-fm-success border border-fm-success/30',
  rejected: 'bg-fm-text-tertiary/10 text-fm-text-tertiary border border-fm-text-tertiary/30',
  draft: 'bg-fm-accent/10 text-fm-accent border border-fm-accent/30',
};

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  pending_review: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  draft: 'Draft',
};

function PIIScanLine({
  status,
  onRemediate,
  remediating,
}: {
  status: PIIScanStatus;
  onRemediate: () => void;
  remediating: boolean;
}) {
  switch (status) {
    case 'scanning':
      return <span className="text-fm-warning text-xs">Scanning...</span>;
    case 'clean':
      return <span className="text-fm-success text-xs">PII Scan: &#x2713; Clean</span>;
    case 'pii_detected':
      return (
        <span className="text-fm-critical text-xs">
          PII Scan: PII Detected &mdash; Remediation Required{' '}
          <button
            onClick={onRemediate}
            disabled={remediating}
            className={`ml-2 text-fm-accent hover:underline ${remediating ? 'opacity-50' : ''}`}
          >
            {remediating ? 'Remediating...' : 'Remediate'}
          </button>
        </span>
      );
    case 'remediated':
      return <span className="text-fm-success text-xs">PII Scan: &#x2713; Remediated</span>;
    case 'not_scanned':
      return <span className="text-fm-text-tertiary text-xs">PII Scan: Not scanned</span>;
    case 'scan_failed':
      return <span className="text-fm-text-tertiary text-xs">PII Scan: Scan failed</span>;
  }
}

export function KnowledgeTab({ caseId, caseDetail }: KnowledgeTabProps) {
  const [suggestion, setSuggestion] = useState<KnowledgeSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [remediating, setRemediating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [contentView, setContentView] = useState<'preview' | 'edit'>('preview');

  const isTerminal = caseDetail.is_terminal;
  const status = caseDetail.status;
  const closureReason = caseDetail.closure_reason;

  // Determine if knowledge extraction is available
  const canExtract =
    status === 'resolved' ||
    (status === 'closed' && closureReason === 'mitigation_sufficient');

  useEffect(() => {
    if (!canExtract) {
      setLoading(false);
      return;
    }
    loadSuggestion();
  }, [caseId, canExtract]);

  async function loadSuggestion() {
    setLoading(true);
    setError(null);
    try {
      const data = await getCaseSuggestion(caseId);
      setSuggestion(data);
      if (data) {
        setEditTitle(data.suggested_title);
        setEditContent(data.suggested_content);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suggestion');
    } finally {
      setLoading(false);
    }
  }

  async function handleExtract() {
    setExtracting(true);
    setError(null);
    try {
      const data = await extractKnowledge(caseId);
      setSuggestion(data);
      setEditTitle(data.suggested_title);
      setEditContent(data.suggested_content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract knowledge');
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (!suggestion) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSuggestion(suggestion.suggestion_id, {
        suggested_title: editTitle,
        suggested_content: editContent,
      });
      setSuggestion(updated);
      setEditMode(false);
      setContentView('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!suggestion) return;
    setApproving(true);
    setError(null);
    try {
      await approveSuggestion(suggestion.suggestion_id);
      await loadSuggestion();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve suggestion');
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!suggestion || !rejectReason.trim()) return;
    setRejecting(true);
    setError(null);
    try {
      await rejectSuggestion(suggestion.suggestion_id, rejectReason.trim());
      await loadSuggestion();
      setShowRejectInput(false);
      setRejectReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject suggestion');
    } finally {
      setRejecting(false);
    }
  }

  async function handleRemediate() {
    if (!suggestion) return;
    setRemediating(true);
    setError(null);
    try {
      const updated = await remediatePII(suggestion.suggestion_id);
      setSuggestion(updated);
      setEditTitle(updated.suggested_title);
      setEditContent(updated.suggested_content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remediate PII');
    } finally {
      setRemediating(false);
    }
  }

  // Non-terminal cases
  if (!isTerminal) {
    return (
      <div className="text-fm-text-tertiary text-sm py-4">
        Knowledge extraction will be available after the case is resolved.
      </div>
    );
  }

  // Closed without resolution
  if (!canExtract) {
    return (
      <div className="text-fm-text-tertiary text-sm py-4">
        No knowledge to extract &mdash; case closed without resolution.
      </div>
    );
  }

  if (loading) {
    return <div className="text-fm-text-tertiary text-sm py-4">Loading...</div>;
  }

  const isApproved = suggestion?.status === 'approved';
  const isRejected = suggestion?.status === 'rejected';
  const isReadOnly = isApproved || isRejected;

  return (
    <div className="py-2">
      {/* Extract Section */}
      <div className="bg-fm-surface border border-fm-border rounded-fm-card p-6">
        <p className="text-sm text-fm-text-primary font-medium mb-1">Extract Knowledge</p>
        <p className="text-sm text-fm-text-secondary mb-3">
          Turn this investigation into reusable knowledge for your team. PII is automatically
          removed.
        </p>
        <p className="text-xs text-fm-text-tertiary mb-4">
          Source: {caseDetail.current_turn} messages &middot; {caseDetail.evidence_count} evidence
          items
        </p>
        {!suggestion && (
          <button
            onClick={handleExtract}
            disabled={extracting}
            className={`bg-fm-accent text-white rounded-fm-btn px-4 py-2 text-sm font-medium hover:brightness-110 transition-colors ${
              extracting ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {extracting ? 'Extracting...' : 'Extract Knowledge'}
          </button>
        )}
        {suggestion && !isApproved && !isRejected && (
          <p className="text-xs text-fm-success">Knowledge extracted. Review below.</p>
        )}
      </div>

      {error && <p className="text-fm-critical text-xs mt-2">{error}</p>}

      {/* Article Review Section */}
      {suggestion && (
        <div className="bg-fm-surface border border-fm-border rounded-fm-card p-6 mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-fm-text-primary">Extracted Article</p>
            <span
              className={`rounded-fm-chip px-2 py-0.5 text-xs font-medium ${
                STATUS_BADGE_CLASSES[suggestion.status]
              }`}
            >
              {STATUS_LABELS[suggestion.status]}
            </span>
          </div>

          {/* Title */}
          <div className="mb-4">
            <label className="text-xs text-fm-text-tertiary mb-1 block">Title</label>
            {editMode && !isReadOnly ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors text-sm"
              />
            ) : (
              <p className="text-sm text-fm-text-primary font-medium">{suggestion.suggested_title}</p>
            )}
          </div>

          {/* Content */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-fm-text-tertiary">Content</label>
              {editMode && !isReadOnly && (
                <button
                  onClick={() =>
                    setContentView(contentView === 'preview' ? 'edit' : 'preview')
                  }
                  className="text-fm-accent text-xs hover:underline cursor-pointer"
                >
                  {contentView === 'preview' ? 'Edit' : 'Preview'}
                </button>
              )}
            </div>
            {editMode && !isReadOnly && contentView === 'edit' ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={12}
                className="w-full px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors text-sm font-mono"
              />
            ) : (
              <div className="bg-fm-surface-alt border border-fm-border rounded-fm-card p-4 max-h-96 overflow-auto">
                <pre className="whitespace-pre-wrap font-mono text-xs text-fm-text-secondary">
                  {editMode ? editContent : suggestion.suggested_content}
                </pre>
              </div>
            )}
          </div>

          {/* PII Scan */}
          <div className="mb-4">
            <PIIScanLine
              status={suggestion.pii_scan_status}
              onRemediate={handleRemediate}
              remediating={remediating}
            />
          </div>

          {/* Actions */}
          {!isReadOnly && (
            <div className="flex gap-2 flex-wrap">
              {editMode ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`bg-fm-accent text-white rounded-fm-btn px-4 py-2 text-sm font-medium hover:brightness-110 transition-colors ${
                      saving ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setContentView('preview');
                      setEditTitle(suggestion.suggested_title);
                      setEditContent(suggestion.suggested_content);
                    }}
                    className="border border-fm-border text-fm-text-primary rounded-fm-btn px-4 py-2 text-sm font-medium hover:bg-fm-elevated transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    className={`bg-fm-success text-white rounded-fm-btn px-4 py-2 text-sm font-medium hover:brightness-110 transition-colors ${
                      approving ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {approving ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => setShowRejectInput(true)}
                    className="border border-fm-critical/30 text-fm-critical rounded-fm-btn px-4 py-2 text-sm font-medium hover:bg-fm-critical/10 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => {
                      setEditMode(true);
                      setContentView('preview');
                    }}
                    className="border border-fm-border text-fm-text-primary rounded-fm-btn px-4 py-2 text-sm font-medium hover:bg-fm-elevated transition-colors"
                  >
                    Edit Before Approval
                  </button>
                </>
              )}
            </div>
          )}

          {/* Reject reason input */}
          {showRejectInput && !isReadOnly && (
            <div className="mt-3 flex gap-2 items-center">
              <input
                type="text"
                placeholder="Reason for rejection (required)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="flex-1 px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors text-sm"
              />
              <button
                onClick={handleReject}
                disabled={rejecting || !rejectReason.trim()}
                className={`bg-fm-critical text-white rounded-fm-btn px-3 py-1.5 text-xs font-medium hover:brightness-110 transition-colors ${
                  rejecting || !rejectReason.trim() ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {rejecting ? 'Rejecting...' : 'Confirm Reject'}
              </button>
              <button
                onClick={() => {
                  setShowRejectInput(false);
                  setRejectReason('');
                }}
                className="text-xs text-fm-text-tertiary hover:text-fm-text-primary"
              >
                Cancel
              </button>
            </div>
          )}

          {/* After approval */}
          {isApproved && suggestion.knowledge_item_id && (
            <p className="text-sm mt-3">
              <span className="text-fm-accent hover:underline cursor-pointer">
                View in Knowledge Base &rarr;
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
