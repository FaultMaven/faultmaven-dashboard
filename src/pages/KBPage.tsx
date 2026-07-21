import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { logoutAuth, uploadDocument, type KBDocument, type AdminKBDocument } from '../lib/api';
import {
  convertDocument,
  updateDraft,
  verifyDraft,
  verifyBatch,
  deleteDraft,
  createRunbookManually,
  listAllDrafts,
  getConversion,
  scanForRunbooks,
  ConversionAPIError,
} from '../lib/knowledge/conversion';
import type {
  ConversionResponse,
  ConversionDraft,
  ConversionErrorInfo,
  DraftSummary,
  BatchVerifyResponse,
  BatchVerifyItemResult,
} from '../lib/knowledge/conversion';
import { UploadZone } from '../components/UploadZone';
import { UploadModal } from '../components/UploadModal';
import { DocumentList } from '../components/DocumentList';
import { PageHeader } from '../components/PageHeader';
import { PaginationControls } from '../components/PaginationControls';
import { ConvertUpload } from '../components/ConvertUpload';
import { ConversionResults } from '../components/ConversionResults';
import { DraftEditor } from '../components/DraftEditor';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CreateRunbookForm, type RunbookFormData } from '../components/CreateRunbookForm';
import { useKBList, type KnowledgeScope } from '../hooks/useKBList';
import { useAvailableScopes } from '../hooks/useAvailableScopes';
import { debounce } from '../utils/debounce';
import { useAuth } from '../context/AuthContext';

const inputClass =
  'w-full px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

// =============================================================================
// Main tab type
// =============================================================================

type KBTab = 'documents' | 'drafts';

// =============================================================================
// "+ New" Dropdown
// =============================================================================

interface NewDropdownProps {
  onUpload: () => void;
  onConvert: () => void;
  onManual: () => void;
}

function NewDropdown({ onUpload, onConvert, onManual }: NewDropdownProps) {
  const [open, setOpen] = useState(false);

  const items = [
    { label: 'Add Runbook', description: 'Upload a validated runbook file directly', onClick: onUpload },
    { label: 'Convert to Runbook', description: 'AI extracts runbooks from a document', onClick: onConvert },
    { label: 'Write Runbook', description: 'Create from the standard template', onClick: onManual },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card z-50">
            {items.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className="w-full text-left px-4 py-3 hover:bg-fm-surface-alt transition-colors first:rounded-t-fm-card last:rounded-b-fm-card"
              >
                <p className="text-sm font-medium text-fm-text-primary">{item.label}</p>
                <p className="text-xs text-fm-text-tertiary">{item.description}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Scope Badge
// =============================================================================

function ScopeBadge({ scope }: { scope: string }) {
  const colors: Record<string, string> = {
    personal: 'bg-fm-surface-alt text-fm-text-secondary',
    team: 'bg-fm-accent/10 text-fm-accent',
    global: 'bg-fm-success-bg text-fm-success',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-fm-chip ${colors[scope] || colors.personal}`}>
      {scope}
    </span>
  );
}

// =============================================================================
// Documents Tab Content
// =============================================================================

function canModifyDocument(doc: KBDocument | AdminKBDocument, isAdmin: boolean, userId: string | null): boolean {
  const scope = doc.scope || 'global';
  if (scope === 'global') return isAdmin;
  if (scope === 'team') return isAdmin; // TODO: check team admin when team roles are implemented
  if (scope === 'personal') return doc.owner_id === userId || doc.user_id === userId;
  return false;
}

function DocumentsTab({ canUpload, isAdmin, userId, refreshKey, onCountChange }: { canUpload: boolean; isAdmin: boolean; userId: string | null; refreshKey: number; onCountChange: (count: number) => void }) {
  const { filteredDocuments, totalCount, loading, page, pageSize, search, setSearch, scopeFilter, setScopeFilter, scopeCounts, loadPage, deleteById } =
    useKBList('user');
  const { scopes: availableScopes } = useAvailableScopes();

  // Re-fetch documents when refreshKey changes (e.g., after draft verification)
  useEffect(() => {
    if (refreshKey > 0) loadPage(0);
  }, [refreshKey, loadPage]);

  // Report count to parent for Runbooks tab badge
  useEffect(() => {
    onCountChange(totalCount);
  }, [totalCount, onCountChange]);

  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  // Domain/Service/Severity filters
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);

  const handleSearchChange = useMemo(
    () => debounce((value: string) => setSearch(value), 200),
    [setSearch],
  );

  // Derive filter options from loaded documents
  const domains = useMemo(() =>
    [...new Set(filteredDocuments.map((d) => (d as KBDocument).metadata?.domain as string).filter(Boolean))].sort(),
    [filteredDocuments],
  );
  const services = useMemo(() =>
    [...new Set(
      filteredDocuments
        .filter((d) => !domainFilter || (d as KBDocument).metadata?.domain === domainFilter)
        .map((d) => (d as KBDocument).metadata?.service as string)
        .filter(Boolean),
    )].sort(),
    [filteredDocuments, domainFilter],
  );

  // Apply metadata filters on top of text search + scope filter
  const displayDocuments = useMemo(() => {
    let docs = filteredDocuments;
    if (domainFilter) {
      docs = docs.filter((d) => (d as KBDocument).metadata?.domain === domainFilter);
    }
    if (serviceFilter) {
      docs = docs.filter((d) => (d as KBDocument).metadata?.service === serviceFilter);
    }
    if (severityFilter) {
      docs = docs.filter((d) => (d as KBDocument).metadata?.severity === severityFilter);
    }
    return docs;
  }, [filteredDocuments, domainFilter, serviceFilter, severityFilter]);

  // Clear service filter when domain changes
  const handleDomainChange = (value: string | null) => {
    setDomainFilter(value);
    setServiceFilter(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = displayDocuments.length > 0 && displayDocuments.every((d) => selectedIds.has(d.document_id));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayDocuments.map((d) => d.document_id)));
    }
  };

  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    try {
      for (const id of selectedIds) {
        try { await deleteById(id); } catch { /* continue */ }
      }
      setSelectedIds(new Set());
    } finally {
      setBatchDeleting(false);
    }
  };

  const confirmArchive = async () => {
    if (!confirmArchiveId) return;
    try {
      setArchiveError(null);
      await deleteById(confirmArchiveId);
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Failed to remove runbook');
    } finally {
      setConfirmArchiveId(null);
    }
  };

  return (
    <>
      {/* Filters row */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="search"
          defaultValue={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by title..."
          className={`flex-1 min-w-[160px] ${inputClass}`}
          aria-label="Search runbooks"
        />
        <select
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value as KnowledgeScope)}
          className={`w-40 ${inputClass}`}
          aria-label="Filter by scope"
        >
          <option value="all">All scopes</option>
          {availableScopes.includes('global') && (
            <option value="global">Global ({scopeCounts.global})</option>
          )}
          {availableScopes.includes('team') && (
            <option value="team">Team ({scopeCounts.team})</option>
          )}
          {availableScopes.includes('personal') && (
            <option value="personal">Personal ({scopeCounts.personal})</option>
          )}
        </select>
        <select
          value={domainFilter ?? ''}
          onChange={(e) => handleDomainChange(e.target.value || null)}
          className={`w-36 ${inputClass}`}
          aria-label="Filter by domain"
        >
          <option value="">All domains</option>
          {domains.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={serviceFilter ?? ''}
          onChange={(e) => setServiceFilter(e.target.value || null)}
          className={`w-36 ${inputClass}`}
          aria-label="Filter by service"
        >
          <option value="">All services</option>
          {services.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={severityFilter ?? ''}
          onChange={(e) => setSeverityFilter(e.target.value || null)}
          className={`w-32 ${inputClass}`}
          aria-label="Filter by severity"
        >
          <option value="">All severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <div className="text-xs text-fm-text-tertiary whitespace-nowrap">{displayDocuments.length} runbook{displayDocuments.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Select all + batch action toolbar */}
      {canUpload && displayDocuments.length > 0 && (
        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-xs text-fm-text-tertiary">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-4 h-4 rounded border-fm-border text-fm-accent focus:ring-fm-accent"
            />
            Select all
          </label>
          {selectedIds.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-fm-text-secondary">{selectedIds.size} selected</span>
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleting}
                className="px-2.5 py-1 text-xs font-medium text-fm-critical border border-fm-critical/30 rounded-fm-btn hover:bg-fm-critical/10 transition-colors disabled:opacity-50"
              >
                {batchDeleting ? 'Removing...' : 'Remove'}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-fm-text-tertiary hover:text-fm-text-primary"
              >
                Clear
              </button>
            </div>
          ) : (
            <span className="text-xs text-fm-text-tertiary">Select to remove</span>
          )}
        </div>
      )}

      {archiveError && (
        <div className="mb-3 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
          {archiveError}
        </div>
      )}

      <DocumentList
        documents={displayDocuments as (KBDocument | AdminKBDocument)[]}
        loading={loading}
        totalCount={displayDocuments.length}
        onDelete={() => {}}
        onUpdated={() => loadPage(page)}
        emptyMessage="No runbooks in your knowledge base yet."
        canEditFn={(doc) => canModifyDocument(doc as KBDocument, isAdmin, userId)}
        canRemove={false}
        selectedIds={canUpload ? selectedIds : undefined}
        onToggleSelect={canUpload ? toggleSelect : undefined}
      />
      <PaginationControls page={page} pageSize={pageSize} total={totalCount} onPageChange={(p) => loadPage(p)} />

      <ConfirmDialog
        isOpen={!!confirmArchiveId}
        title="Remove Runbook"
        message="Remove this runbook from the knowledge base? It will no longer be available during investigations."
        confirmLabel="Remove"
        onConfirm={confirmArchive}
        onCancel={() => setConfirmArchiveId(null)}
      />
    </>
  );
}

// =============================================================================
// Drafts Tab Content
// =============================================================================

interface DraftsTabProps {
  drafts: DraftSummary[];
  /** Active case-id filter (e.g. from deep-link), or null. */
  caseFilter: string | null;
  /** Clear the case filter (drops the URL ``case`` param). */
  onClearCaseFilter: () => void;
  loading: boolean;
  onOpen: (conversionId: string) => void;
  onRefresh: () => void;
  onScan: () => Promise<void>;
  onDismissScan: () => void;
  scanning: boolean;
  scanResult: string | null;
  selectedDrafts: Array<{ conversion_id: string; draft_id: string }>;
  onSelectionChange: (selected: Array<{ conversion_id: string; draft_id: string }>) => void;
  onBatchVerify: () => void;
  onBatchDelete: () => void;
  batchActionInProgress: boolean;
}

function DraftsTab({ drafts, caseFilter, onClearCaseFilter, loading, onOpen, onScan, onDismissScan, scanning, scanResult, selectedDrafts, onSelectionChange, onBatchVerify, onBatchDelete, batchActionInProgress }: DraftsTabProps) {
  const pendingDrafts = drafts.filter((d) => d.status === 'draft');

  const gradeColor: Record<string, string> = {
    A: 'text-fm-success', B: 'text-fm-success', C: 'text-fm-warning', D: 'text-fm-warning', F: 'text-fm-critical',
  };

  const isSelected = (d: DraftSummary) =>
    selectedDrafts.some((s) => s.draft_id === d.draft_id);

  const toggleSelection = (d: DraftSummary) => {
    if (isSelected(d)) {
      onSelectionChange(selectedDrafts.filter((s) => s.draft_id !== d.draft_id));
    } else {
      onSelectionChange([...selectedDrafts, { conversion_id: d.conversion_id, draft_id: d.draft_id }]);
    }
  };

  const allSelected = pendingDrafts.length > 0 && pendingDrafts.every((d) => isSelected(d));
  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(pendingDrafts.map((d) => ({ conversion_id: d.conversion_id, draft_id: d.draft_id })));
    }
  };

  const renderDraftRow = (d: DraftSummary) => {
    const grade = d.quality_details?.grade || '?';
    const score = d.quality_score != null ? d.quality_score.toFixed(0) : '?';
    const checked = isSelected(d);

    return (
      <div
        key={d.draft_id}
        className="flex items-center gap-3 px-3 py-2 border border-fm-border rounded-fm-input hover:border-fm-accent hover:bg-fm-surface-alt transition-colors"
      >
        <label className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleSelection(d)}
            className="w-4 h-4 rounded border-fm-border text-fm-accent focus:ring-fm-accent"
          />
        </label>
        <button
          onClick={() => onOpen(d.conversion_id)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-fm-text-primary truncate">{d.title}</p>
              <ScopeBadge scope={d.scope} />
              {d.source_type === 'case' && (
                <span className="text-xs px-1.5 py-px rounded-fm-chip bg-fm-accent/10 text-fm-accent border border-fm-accent/20">
                  from case
                </span>
              )}
              <span className={`text-xs font-mono font-medium ${gradeColor[grade] || 'text-fm-text-tertiary'}`}>
                {score}/{grade}
              </span>
              {!d.validation_passed && (
                <svg className="w-3.5 h-3.5 text-fm-critical flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Validation errors">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              )}
            </div>
          </div>
          <svg className="w-3.5 h-3.5 text-fm-text-tertiary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {pendingDrafts.length > 0 && (
            <>
              <label className="flex items-center gap-2 text-xs text-fm-text-tertiary">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-fm-border text-fm-accent focus:ring-fm-accent"
                />
                Select all
              </label>
              {selectedDrafts.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-fm-text-secondary">{selectedDrafts.length} selected</span>
                  <button
                    onClick={onBatchVerify}
                    disabled={batchActionInProgress}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-50"
                  >
                    Activate
                  </button>
                  <button
                    onClick={onBatchDelete}
                    disabled={batchActionInProgress}
                    className="px-2.5 py-1 text-xs font-medium text-fm-critical border border-fm-critical/30 rounded-fm-btn hover:bg-fm-critical/10 transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => onSelectionChange([])}
                    className="text-xs text-fm-text-tertiary hover:text-fm-text-primary"
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <span className="text-xs text-fm-text-tertiary">Select to activate or delete</span>
              )}
            </>
          )}
        </div>
        <button
          onClick={onScan}
          disabled={scanning}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors disabled:opacity-50"
          title="Scan data/knowledge/ for runbook files not yet tracked"
        >
          <svg className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {scanning ? 'Scanning...' : 'Scan for runbooks'}
        </button>
      </div>

      {scanResult && (
        <div className="mb-4 text-sm text-fm-success bg-fm-success-bg border border-fm-success-border rounded-fm-btn p-3 flex items-center justify-between">
          <span>{scanResult}</span>
          <button onClick={() => onDismissScan()} className="text-fm-success hover:brightness-75 ml-3" aria-label="Dismiss">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Active case filter chip — set when the user landed here via a
          deep-link from a case's Report tab (``?case=<id>``). Clicking
          the × clears the filter and shows the full drafts list. */}
      {caseFilter && (
        <div className="mb-3 flex items-center gap-2 text-xs text-fm-text-secondary">
          <span>Filtered by case</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fm-accent/10 text-fm-accent border border-fm-accent/20 font-mono">
            {caseFilter}
            <button
              onClick={onClearCaseFilter}
              className="hover:brightness-110"
              aria-label="Clear case filter"
              title="Show all drafts"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-fm-text-tertiary py-6 text-center">Loading drafts...</p>
      ) : drafts.length === 0 && caseFilter ? (
        // Filter is active but yielded no rows — be specific about why
        // and offer a way back to the full list rather than nudging the
        // user toward "+ New" or "Scan", which aren't what they came for.
        <div className="py-10 text-center">
          <p className="text-fm-text-secondary mb-1">No drafts found for this case.</p>
          <p className="text-sm text-fm-text-tertiary">
            The draft may have been verified or deleted.{' '}
            <button
              onClick={onClearCaseFilter}
              className="text-fm-accent hover:underline"
            >
              Show all drafts
            </button>
            .
          </p>
        </div>
      ) : drafts.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-fm-text-secondary mb-1">No draft runbooks yet.</p>
          <p className="text-sm text-fm-text-tertiary">
            Use <strong>+ New</strong> to create runbooks, or <strong>Scan for runbooks</strong> to discover files in data/knowledge/.
          </p>
        </div>
      ) : pendingDrafts.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-fm-text-secondary mb-1">All drafts have been verified.</p>
          <p className="text-sm text-fm-text-tertiary">
            Verified runbooks appear in the <strong>Runbooks</strong> tab.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {pendingDrafts.map(renderDraftRow)}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Conversion/Creation Overlay (modal-like inline panel)
// =============================================================================

type OverlayMode = null | 'upload' | 'convert' | 'manual' | 'results' | 'editor';

interface OverlayPanelProps {
  mode: OverlayMode;
  // Upload
  onUploadFile: (params: { file: File; title: string; document_type: string; tags: string; description: string }) => Promise<void>;
  // Convert
  conversion: ConversionResponse | null;
  convertError: ConversionErrorInfo | null;
  converting: boolean;
  onConvert: (file: File, scope: string) => Promise<void>;
  // Manual
  manualLoading: boolean;
  manualError: string | null;
  onManualCreate: (data: RunbookFormData) => Promise<void>;
  // Results/Editor
  editingDraft: ConversionDraft | null;
  saving: boolean;
  onEdit: (draft: ConversionDraft) => void;
  onSave: (content: string) => Promise<ConversionDraft | null>;
  onVerify: (draft: ConversionDraft) => void;
  onDelete: (draft: ConversionDraft) => void;
  onBack: () => void;
  onClose: () => void;
}

function OverlayPanel(props: OverlayPanelProps) {
  const { mode } = props;

  // Upload file modal state. Hooks must be declared unconditionally and before
  // any early return so the hook count is stable across renders (rules of hooks).
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', document_type: 'runbook', tags: '', description: '' });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!mode) return null;

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setUploadForm({ ...uploadForm, title: file.name.replace(/\.[^/.]+$/, '') });
    setShowUploadModal(true);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      await props.onUploadFile({ file: selectedFile, ...uploadForm });
      props.onClose();
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (mode === 'upload') {
    return (
      <div className="bg-fm-surface rounded-fm-card border border-fm-border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-fm-text-primary">Add Runbook</h3>
          <button onClick={props.onClose} className="text-fm-text-tertiary hover:text-fm-text-primary text-sm">Cancel</button>
        </div>
        <UploadZone onFileSelected={handleFileSelect} />
        <UploadModal
          isOpen={showUploadModal}
          title="Add Runbook"
          fileName={selectedFile?.name}
          errorMessage={uploadError}
          loading={uploading}
          onCancel={() => { setShowUploadModal(false); setSelectedFile(null); }}
          onSubmit={handleUploadSubmit}
        >
          <div>
            <label className="block text-sm font-medium text-fm-text-secondary mb-1">Title <span className="text-fm-critical">*</span></label>
            <input type="text" required value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} className={inputClass} placeholder="Enter document title" />
          </div>
          <div>
            <label className="block text-sm font-medium text-fm-text-secondary mb-1">Document Type <span className="text-fm-critical">*</span></label>
            <input
              type="text"
              list="document-types"
              required
              value={uploadForm.document_type}
              onChange={(e) => setUploadForm({ ...uploadForm, document_type: e.target.value })}
              className={inputClass}
              placeholder="e.g. runbook, playbook, reference"
            />
            <datalist id="document-types">
              <option value="runbook" />
              <option value="playbook" />
              <option value="troubleshooting_guide" />
              <option value="reference" />
              <option value="how_to" />
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-fm-text-secondary mb-1">Tags (comma-separated)</label>
            <input type="text" value={uploadForm.tags} onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })} className={inputClass} placeholder="e.g. kubernetes, docker" />
          </div>
          <div>
            <label className="block text-sm font-medium text-fm-text-secondary mb-1">Description</label>
            <textarea value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} className={inputClass} rows={3} placeholder="Brief description" />
          </div>
        </UploadModal>
      </div>
    );
  }

  if (mode === 'convert') {
    return (
      <div className="bg-fm-surface rounded-fm-card border border-fm-border p-6 mb-6">
        <ConvertUpload onConvert={props.onConvert} onCancel={props.onClose} loading={props.converting} error={props.convertError} />
      </div>
    );
  }

  if (mode === 'manual') {
    return (
      <div className="bg-fm-surface rounded-fm-card border border-fm-border p-6 mb-6">
        <CreateRunbookForm onSubmit={props.onManualCreate} onCancel={props.onClose} loading={props.manualLoading} error={props.manualError} />
      </div>
    );
  }

  if (mode === 'results' && props.conversion) {
    return (
      <div className="bg-fm-surface rounded-fm-card border border-fm-border p-6 mb-6">
        <ConversionResults
          conversion={props.conversion}
          onEdit={props.onEdit}
          onVerify={props.onVerify}
          onDelete={props.onDelete}
          onBack={props.onBack}
        />
      </div>
    );
  }

  if (mode === 'editor' && props.editingDraft) {
    return (
      <div className="bg-fm-surface rounded-fm-card border border-fm-border p-6 mb-6">
        <DraftEditor
          draft={props.editingDraft}
          onSave={props.onSave}
          onVerify={() => props.onVerify(props.editingDraft!)}
          onCancel={props.onBack}
          saving={props.saving}
        />
      </div>
    );
  }

  return null;
}

// =============================================================================
// KBPage
// =============================================================================

export default function KBPage() {
  const { deployment, role, authState, clearAuthState } = useAuth();
  const isAdmin = role === 'platform_admin';
  const canUpload = deployment === 'standalone' || isAdmin;

  // Tab + draft-case-filter are URL-driven so other pages can deep-link
  // here. The ReportTab in case-detail links to ``/kb?tab=drafts&case=<id>``
  // when a runbook draft was generated for that case — landing the user
  // on the Drafts tab filtered to that case's runbook(s).
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: KBTab =
    searchParams.get('tab') === 'drafts' ? 'drafts' : 'documents';
  const caseFilter = searchParams.get('case');

  const setActiveTab = useCallback(
    (tab: KBTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === 'drafts') {
            next.set('tab', 'drafts');
          } else {
            next.delete('tab');
            // Case filter is meaningful only for the Drafts tab; clear
            // it when leaving so it doesn't surprise the user on return.
            next.delete('case');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clearCaseFilter = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('case');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const [docsRefreshKey, setDocsRefreshKey] = useState(0);

  // Overlay state (creation/editing flows)
  const [overlayMode, setOverlayMode] = useState<OverlayMode>(null);
  const [conversion, setConversion] = useState<ConversionResponse | null>(null);
  const [editingDraft, setEditingDraft] = useState<ConversionDraft | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<ConversionErrorInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [confirmVerify, setConfirmVerify] = useState<ConversionDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConversionDraft | null>(null);

  // Drafts
  const DRAFT_COUNT_KEY = 'faultmaven_draftCount';
  const [cachedCount, setCachedCount] = useState(() => {
    const stored = localStorage.getItem(DRAFT_COUNT_KEY);
    return stored !== null ? parseInt(stored, 10) : 0;
  });
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Multi-select state
  const [selectedDrafts, setSelectedDrafts] = useState<Array<{ conversion_id: string; draft_id: string }>>([]);
  const [batchActionInProgress, setBatchActionInProgress] = useState(false);

  // Runbook count (lifted from DocumentsTab)
  const [runbookCount, setRunbookCount] = useState(0);

  // First-time ingestion banner
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    running: boolean;
    total: number;
    completed: number;
    result: BatchVerifyResponse | null;
  } | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const result = await scanForRunbooks();
      loadDrafts();
      const parts: string[] = [];
      if (result.discovered > 0) {
        parts.push(`Discovered ${result.discovered} new runbook${result.discovered !== 1 ? 's' : ''}`);
      }
      setScanResult(parts.length > 0 ? parts.join('. ') + '.' : 'No new runbook files found.');
    } catch {
      setScanResult('Scan failed. Check that data/knowledge/ exists.');
    } finally {
      setScanning(false);
    }
  };

  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const result = await listAllDrafts();
      setDrafts(result);
      const count = result.filter((d) => d.status === 'draft').length;
      setCachedCount(count);
      localStorage.setItem(DRAFT_COUNT_KEY, String(count));
    } catch {
      // silent
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  // Load drafts on mount. Auto-scan was removed — KB ingestion is now
  // owned by the server-side startup bootstrap (faultmaven/bootstrap/kb_init.py).
  // The page-mount scan used to mutate data (downgrade verified→draft on every
  // visit), which corrupted live KB state. Users who want to re-scan
  // manually can use the explicit "Scan for runbooks" button.
  useEffect(() => {
    setInitialLoadDone(true);
    loadDrafts();
  }, [loadDrafts]);

  // Handlers
  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  const closeOverlay = () => {
    setOverlayMode(null);
    setConvertError(null);
    setManualError(null);
  };

  const handleUploadFile = async (params: { file: File; title: string; document_type: string; tags: string; description: string }) => {
    await uploadDocument({ file: params.file, title: params.title, document_type: params.document_type, tags: params.tags, description: params.description });
  };

  const handleConvert = async (file: File, scope: string) => {
    setConverting(true);
    setConvertError(null);
    try {
      const result = await convertDocument(file, scope);
      setConversion(result);
      setOverlayMode('results');
      loadDrafts();
    } catch (err: unknown) {
      if (err instanceof ConversionAPIError) {
        setConvertError(err.errorInfo);
      } else {
        setConvertError({ title: 'Conversion failed', message: err instanceof Error ? err.message : 'Unknown error', action: 'Try again.' });
      }
    } finally {
      setConverting(false);
    }
  };

  const handleManualCreate = async (data: RunbookFormData) => {
    setManualLoading(true);
    setManualError(null);
    try {
      const result = await createRunbookManually(data);
      setConversion({
        conversion_id: result.conversion_id,
        status: 'completed',
        source_file: { filename: data.title, size_bytes: 0, content_type: 'text/markdown', retained_path: '' },
        analysis: { is_actionable: true, failure_modes: [], source_assessment: { content_type: 'manual', actionability_rating: 'high', missing_information: [] } },
        drafts: [result.draft],
        warnings: [],
        created_at: new Date().toISOString(),
      });
      setOverlayMode('results');
      loadDrafts();
    } catch (err: unknown) {
      setManualError(err instanceof Error ? err.message : 'Failed to create runbook');
    } finally {
      setManualLoading(false);
    }
  };

  const handleOpenDraft = async (conversionId: string) => {
    try {
      const result = await getConversion(conversionId);
      if (result) {
        setConversion(result);
        setOverlayMode('results');
      }
    } catch { /* ignore */ }
  };

  const handleEdit = (draft: ConversionDraft) => {
    setEditingDraft(draft);
    setOverlayMode('editor');
  };

  const handleSaveDraft = async (content: string): Promise<ConversionDraft | null> => {
    if (!conversion || !editingDraft) return null;
    setSaving(true);
    try {
      const updated = await updateDraft(conversion.conversion_id, editingDraft.draft_id, content);
      setConversion((prev) => prev ? { ...prev, drafts: prev.drafts.map((d) => d.draft_id === updated.draft_id ? updated : d) } : prev);
      setEditingDraft(updated);
      return updated;
    } finally {
      setSaving(false);
    }
  };

  const [actionError, setActionError] = useState<string | null>(null);

  const handleVerifyConfirmed = async () => {
    if (!conversion || !confirmVerify) return;
    setActionError(null);
    try {
      await verifyDraft(conversion.conversion_id, confirmVerify.draft_id);
      setConversion((prev) => prev ? { ...prev, drafts: prev.drafts.map((d) => d.draft_id === confirmVerify.draft_id ? { ...d, status: 'verified' as const } : d) } : prev);
      loadDrafts();
      setDocsRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setConfirmVerify(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!conversion || !confirmDelete) return;
    try {
      await deleteDraft(conversion.conversion_id, confirmDelete.draft_id);
      setConversion((prev) => prev ? { ...prev, drafts: prev.drafts.filter((d) => d.draft_id !== confirmDelete.draft_id) } : prev);
      loadDrafts();
    } catch { /* ignore */ } finally {
      setConfirmDelete(null);
    }
  };

  // Batch verify with chunked progress — small batches to avoid timeouts
  const BATCH_SIZE = 5;

  const handleBatchVerify = async () => {
    if (selectedDrafts.length === 0) return;
    setBatchActionInProgress(true);
    setBatchProgress({ running: true, total: selectedDrafts.length, completed: 0, result: null });

    const allResults: BatchVerifyItemResult[] = [];
    let verified = 0, failed = 0, skipped = 0;

    for (let i = 0; i < selectedDrafts.length; i += BATCH_SIZE) {
      const chunk = selectedDrafts.slice(i, i + BATCH_SIZE);
      try {
        const result = await verifyBatch(chunk);
        allResults.push(...result.results);
        verified += result.verified;
        failed += result.failed;
        skipped += result.skipped;
      } catch {
        failed += chunk.length;
        for (const ref of chunk) {
          allResults.push({ ...ref, status: 'failed', error: 'Request failed', knowledge_item_id: null });
        }
      }
      setBatchProgress((prev) => prev ? { ...prev, completed: Math.min(i + chunk.length, selectedDrafts.length) } : prev);
    }

    setBatchProgress({
      running: false,
      total: selectedDrafts.length,
      completed: selectedDrafts.length,
      result: { total: selectedDrafts.length, verified, failed, skipped, results: allResults },
    });
    setSelectedDrafts([]);
    loadDrafts();
    setDocsRefreshKey((k) => k + 1);
    setBatchActionInProgress(false);
  };

  const handleBatchDelete = async () => {
    setBatchActionInProgress(true);
    try {
      for (const ref of selectedDrafts) {
        try {
          await deleteDraft(ref.conversion_id, ref.draft_id);
        } catch { /* continue */ }
      }
      setSelectedDrafts([]);
      loadDrafts();
    } finally {
      setBatchActionInProgress(false);
    }
  };

  // First-time ingestion: ingest all pending drafts
  const handleIngestAll = async () => {
    const pending = drafts.filter((d) => d.status === 'draft');
    const refs = pending.map((d) => ({ conversion_id: d.conversion_id, draft_id: d.draft_id }));
    setSelectedDrafts(refs);

    setBatchActionInProgress(true);
    setBatchProgress({ running: true, total: refs.length, completed: 0, result: null });

    const allResults: BatchVerifyItemResult[] = [];
    let verified = 0, failed = 0, skipped = 0;

    for (let i = 0; i < refs.length; i += BATCH_SIZE) {
      const chunk = refs.slice(i, i + BATCH_SIZE);
      try {
        const result = await verifyBatch(chunk);
        allResults.push(...result.results);
        verified += result.verified;
        failed += result.failed;
        skipped += result.skipped;
      } catch {
        // Count chunk items as failed but continue with next chunk
        failed += chunk.length;
        for (const ref of chunk) {
          allResults.push({ ...ref, status: 'failed', error: 'Request failed', knowledge_item_id: null });
        }
      }
      setBatchProgress((prev) => prev ? { ...prev, completed: Math.min(i + chunk.length, refs.length) } : prev);
    }

    setBatchProgress({
      running: false,
      total: refs.length,
      completed: refs.length,
      result: { total: refs.length, verified, failed, skipped, results: allResults },
    });
    setSelectedDrafts([]);
    loadDrafts();
    setDocsRefreshKey((k) => k + 1);
    setActiveTab('documents');
    setBatchActionInProgress(false);
  };

  const handleOverlayBack = () => {
    if (overlayMode === 'editor') {
      setEditingDraft(null);
      setOverlayMode('results');
    } else {
      closeOverlay();
    }
  };

  const liveDraftCount = drafts.filter((d) => d.status === 'draft').length;
  const draftCount = drafts.length > 0 ? liveDraftCount : cachedCount;
  const pendingCount = drafts.filter((d) => d.status === 'draft').length;
  const showFirstTimeBanner = initialLoadDone && pendingCount > 0 && runbookCount === 0 && !bannerDismissed;

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">Knowledge Base</h2>
            <p className="text-fm-text-secondary">Build and maintain your troubleshooting runbooks — the knowledge FaultMaven draws on during investigations.</p>
          </div>
          {canUpload && !overlayMode && (
            <NewDropdown
              onUpload={() => setOverlayMode('upload')}
              onConvert={() => setOverlayMode('convert')}
              onManual={() => setOverlayMode('manual')}
            />
          )}
        </div>

        {/* First-time ingestion banner */}
        {showFirstTimeBanner && (
          <div className="mb-6 p-4 bg-fm-accent/5 border border-fm-accent/20 rounded-fm-card">
            {!batchProgress?.running && !batchProgress?.result && (
              <>
                <p className="text-sm text-fm-text-primary font-medium mb-2">
                  {pendingCount} runbook{pendingCount !== 1 ? 's' : ''} ready to ingest
                </p>
                <p className="text-xs text-fm-text-secondary mb-3">
                  Built-in runbooks have been discovered. Ingest them to make them searchable during investigations.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleIngestAll}
                    className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors"
                  >
                    Activate All
                  </button>
                  <button
                    onClick={() => { setBannerDismissed(true); setActiveTab('drafts'); }}
                    className="px-4 py-2 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
                  >
                    Review First
                  </button>
                </div>
              </>
            )}

            {batchProgress?.running && (
              <div>
                <p className="text-sm text-fm-text-primary font-medium mb-2">
                  Ingesting runbooks...
                </p>
                <div className="w-full bg-fm-surface-alt rounded-full h-2 mb-2">
                  <div
                    className="bg-fm-accent h-2 rounded-full transition-all"
                    style={{ width: `${(batchProgress.completed / batchProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-fm-text-tertiary">
                  {batchProgress.completed} of {batchProgress.total} complete
                </p>
              </div>
            )}

            {batchProgress?.result && (
              <p className="text-sm text-fm-success font-medium">
                Done. {batchProgress.result.verified} activated
                {batchProgress.result.failed > 0 && `, ${batchProgress.result.failed} failed`}
                {batchProgress.result.skipped > 0 && `, ${batchProgress.result.skipped} skipped`}.
              </p>
            )}
          </div>
        )}

        {/* Overlay panel (creation/editing) — mounted only when active so the
            panel's hooks mount/unmount as a whole rather than toggling hook
            count on the same fiber (rules of hooks). */}
        {overlayMode && (
        <OverlayPanel
          mode={overlayMode}
          onUploadFile={handleUploadFile}
          conversion={conversion}
          convertError={convertError}
          converting={converting}
          onConvert={handleConvert}
          manualLoading={manualLoading}
          manualError={manualError}
          onManualCreate={handleManualCreate}
          editingDraft={editingDraft}
          saving={saving}
          onEdit={handleEdit}
          onSave={handleSaveDraft}
          onVerify={(draft) => setConfirmVerify(draft)}
          onDelete={(draft) => setConfirmDelete(draft)}
          onBack={handleOverlayBack}
          onClose={closeOverlay}
        />
        )}

        {/* Tab bar */}
        {!overlayMode && (
          <>
            <div className="flex gap-1 mb-4 border-b border-fm-border">
              <button
                onClick={() => setActiveTab('documents')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
                  activeTab === 'documents'
                    ? 'text-fm-accent border-fm-accent'
                    : 'text-fm-text-tertiary border-transparent hover:text-fm-text-primary'
                }`}
              >
                Runbooks
                {runbookCount > 0 && (
                  <span className="bg-fm-success/10 text-fm-success text-xs px-1.5 py-0.5 rounded-full font-mono">
                    {runbookCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('drafts')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
                  activeTab === 'drafts'
                    ? 'text-fm-accent border-fm-accent'
                    : 'text-fm-text-tertiary border-transparent hover:text-fm-text-primary'
                }`}
              >
                Drafts
                {draftCount > 0 && (
                  <span className="bg-fm-warning-bg text-fm-warning text-xs px-1.5 py-0.5 rounded-full font-mono">
                    {draftCount}
                  </span>
                )}
              </button>
            </div>

            <div className="bg-fm-surface rounded-fm-card border border-fm-border p-5">
              <div className={activeTab === 'documents' ? '' : 'hidden'}>
                <DocumentsTab canUpload={canUpload} isAdmin={isAdmin} userId={authState?.user?.user_id ?? null} refreshKey={docsRefreshKey} onCountChange={setRunbookCount} />
              </div>
              {activeTab === 'drafts' && (
                <DraftsTab
                  drafts={
                    caseFilter
                      ? drafts.filter((d) => d.case_id === caseFilter)
                      : drafts
                  }
                  caseFilter={caseFilter}
                  onClearCaseFilter={clearCaseFilter}
                  loading={draftsLoading}
                  onOpen={handleOpenDraft}
                  onRefresh={loadDrafts}
                  onScan={handleScan}
                  onDismissScan={() => setScanResult(null)}
                  scanning={scanning}
                  scanResult={scanResult}
                  selectedDrafts={selectedDrafts}
                  onSelectionChange={setSelectedDrafts}
                  onBatchVerify={handleBatchVerify}
                  onBatchDelete={handleBatchDelete}
                  batchActionInProgress={batchActionInProgress}
                />
              )}
            </div>
          </>
        )}

        {/* Action error banner */}
        {actionError && (
          <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-fm-critical-bg border border-fm-critical-border rounded-fm-card p-4 shadow-fm-card flex items-start gap-3">
            <p className="text-sm text-fm-critical flex-1">{actionError}</p>
            <button onClick={() => setActionError(null)} className="text-fm-critical hover:brightness-75" aria-label="Dismiss">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Confirm dialogs */}
        <ConfirmDialog
          isOpen={!!confirmVerify}
          title="Activate Runbook"
          message="This will activate the runbook, making it searchable by the AI during investigations."
          confirmLabel="Confirm"
          onConfirm={handleVerifyConfirmed}
          onCancel={() => setConfirmVerify(null)}
        />
        <ConfirmDialog
          isOpen={!!confirmDelete}
          title="Delete Draft"
          message="Delete this draft? The runbook file will be removed. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirmDelete(null)}
        />
      </main>
    </div>
  );
}
