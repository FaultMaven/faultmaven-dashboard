import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { logoutAuth, uploadDocument, type KBDocument, type AdminKBDocument } from '../lib/api';
import {
  convertDocument,
  updateDraft,
  verifyDraft,
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
import { useKBList } from '../hooks/useKBList';
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
    { label: 'Upload Runbook', description: 'Upload a validated runbook file directly', onClick: onUpload },
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

function DocumentsTab({ canUpload }: { canUpload: boolean }) {
  const { filteredDocuments, totalCount, loading, page, pageSize, search, setSearch, loadPage, deleteById } =
    useKBList('user');

  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Client-side scope filter (backend already returns only accessible docs)
  const scopedDocuments = scopeFilter === 'all'
    ? filteredDocuments
    : filteredDocuments.filter((d) => {
        const doc = d as KBDocument;
        return doc.scope === scopeFilter;
      });

  const handleSearchChange = useMemo(
    () => debounce((value: string) => setSearch(value), 200),
    [setSearch],
  );

  const confirmArchive = async () => {
    if (!confirmArchiveId) return;
    try {
      setArchiveError(null);
      await deleteById(confirmArchiveId);
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Failed to archive document');
    } finally {
      setConfirmArchiveId(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-3 flex-1">
          <input
            type="search"
            defaultValue={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search documents..."
            className={`max-w-md ${inputClass}`}
            aria-label="Search documents"
          />
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className={`w-32 ${inputClass}`}
            aria-label="Filter by scope"
          >
            <option value="all">All scopes</option>
            <option value="personal">Personal</option>
            <option value="team">Team</option>
            <option value="global">Global</option>
          </select>
        </div>
        <div className="text-sm text-fm-text-tertiary">{scopedDocuments.length} documents</div>
      </div>

      {archiveError && (
        <div className="mb-3 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
          {archiveError}
        </div>
      )}

      <DocumentList
        documents={scopedDocuments as (KBDocument | AdminKBDocument)[]}
        loading={loading}
        totalCount={scopedDocuments.length}
        onDelete={canUpload ? (id) => setConfirmArchiveId(id) : () => {}}
        emptyMessage="No documents in your knowledge base yet."
      />
      <PaginationControls page={page} pageSize={pageSize} total={totalCount} onPageChange={(p) => loadPage(p)} />

      <ConfirmDialog
        isOpen={!!confirmArchiveId}
        title="Archive Document"
        message="Archive this document? It will be removed from search results but referenced in past cases."
        confirmLabel="Archive"
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
  loading: boolean;
  onOpen: (conversionId: string) => void;
  onRefresh: () => void;
  onScan: () => Promise<void>;
  onDismissScan: () => void;
  scanning: boolean;
  scanResult: string | null;
}

function DraftsTab({ drafts, loading, onOpen, onScan, onDismissScan, scanning, scanResult }: DraftsTabProps) {
  const pendingDrafts = drafts.filter((d) => d.status === 'draft');
  const verifiedDrafts = drafts.filter((d) => d.status === 'verified');

  const gradeColor: Record<string, string> = {
    A: 'text-fm-success', B: 'text-fm-success', C: 'text-fm-warning', D: 'text-fm-warning', F: 'text-fm-critical',
  };

  const renderDraftRow = (d: DraftSummary) => {
    const grade = d.quality_details?.grade || '?';
    const score = d.quality_score != null ? d.quality_score.toFixed(0) : '?';

    return (
      <button
        key={d.draft_id}
        onClick={() => onOpen(d.conversion_id)}
        className="w-full flex items-center gap-4 p-3 text-left border border-fm-border rounded-fm-input hover:border-fm-accent hover:bg-fm-surface-alt transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-fm-text-primary truncate">{d.title}</p>
          <p className="text-xs text-fm-text-tertiary">{d.runbook_id}</p>
        </div>
        <ScopeBadge scope={d.scope} />
        <span className={`text-xs font-mono font-medium ${gradeColor[grade] || 'text-fm-text-tertiary'}`}>
          {score}/{grade}
        </span>
        {!d.validation_passed && (
          <svg className="w-4 h-4 text-fm-critical flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Validation errors">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )}
        {d.status === 'verified' && (
          <span className="text-xs px-2 py-0.5 rounded-fm-chip bg-fm-success-bg text-fm-success">
            verified
          </span>
        )}
        <svg className="w-4 h-4 text-fm-text-tertiary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  };

  return (
    <div>
      {/* Scan bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-fm-text-tertiary">
          {pendingDrafts.length} pending, {verifiedDrafts.length} verified
        </p>
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

      {loading ? (
        <p className="text-sm text-fm-text-tertiary py-8 text-center">Loading drafts...</p>
      ) : drafts.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-fm-text-secondary mb-1">No draft runbooks yet.</p>
          <p className="text-sm text-fm-text-tertiary">
            Use <strong>+ New</strong> to create runbooks, or <strong>Scan for runbooks</strong> to discover files in data/knowledge/.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {pendingDrafts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-fm-text-tertiary uppercase tracking-wide mb-2">
                Pending Review ({pendingDrafts.length})
              </p>
              <div className="space-y-2">{pendingDrafts.map(renderDraftRow)}</div>
            </div>
          )}
          {verifiedDrafts.length > 0 && (
            <div className={pendingDrafts.length > 0 ? 'mt-4' : ''}>
              <p className="text-xs font-medium text-fm-text-tertiary uppercase tracking-wide mb-2">
                Verified ({verifiedDrafts.length})
              </p>
              <div className="space-y-2">{verifiedDrafts.map(renderDraftRow)}</div>
            </div>
          )}
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
  if (!mode) return null;

  // Upload file modal state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', document_type: 'runbook', tags: '', description: '' });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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
          <h3 className="text-lg font-semibold text-fm-text-primary">Upload Runbook</h3>
          <button onClick={props.onClose} className="text-fm-text-tertiary hover:text-fm-text-primary text-sm">Cancel</button>
        </div>
        <UploadZone onFileSelected={handleFileSelect} />
        <UploadModal
          isOpen={showUploadModal}
          title="Upload Runbook"
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
  const { deployment, role, clearAuthState } = useAuth();
  const isAdmin = role === 'platform_admin';
  const canUpload = deployment === 'local' || isAdmin;

  const [activeTab, setActiveTab] = useState<KBTab>('documents');

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
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const result = await scanForRunbooks();
      if (result.discovered > 0) {
        setScanResult(`Discovered ${result.discovered} new runbook${result.discovered !== 1 ? 's' : ''} on disk.`);
        loadDrafts();
      } else {
        setScanResult('No new runbook files found.');
      }
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
    } catch {
      // silent
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => {
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

  const handleOverlayBack = () => {
    if (overlayMode === 'editor') {
      setEditingDraft(null);
      setOverlayMode('results');
    } else {
      closeOverlay();
    }
  };

  const draftCount = drafts.filter((d) => d.status === 'draft').length;

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-fm-heading font-bold text-fm-text-primary mb-1">Knowledge Base</h2>
            <p className="text-fm-text-secondary">Manage runbooks, documentation, and troubleshooting guides.</p>
          </div>
          {canUpload && !overlayMode && (
            <NewDropdown
              onUpload={() => setOverlayMode('upload')}
              onConvert={() => setOverlayMode('convert')}
              onManual={() => setOverlayMode('manual')}
            />
          )}
        </div>

        {/* Overlay panel (creation/editing) */}
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

        {/* Tab bar */}
        {!overlayMode && (
          <>
            <div className="flex gap-1 mb-6 border-b border-fm-border">
              <button
                onClick={() => setActiveTab('documents')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === 'documents'
                    ? 'text-fm-accent border-fm-accent'
                    : 'text-fm-text-tertiary border-transparent hover:text-fm-text-primary'
                }`}
              >
                Documents
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

            <div className="bg-fm-surface rounded-fm-card border border-fm-border p-6">
              {activeTab === 'documents' && <DocumentsTab canUpload={canUpload} />}
              {activeTab === 'drafts' && (
                <DraftsTab
                  drafts={drafts}
                  loading={draftsLoading}
                  onOpen={handleOpenDraft}
                  onRefresh={loadDrafts}
                  onScan={handleScan}
                  onDismissScan={() => setScanResult(null)}
                  scanning={scanning}
                  scanResult={scanResult}
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
          title="Verify and Ingest Runbook"
          message="This will set the runbook status to verified, set verified_by to your username, ingest it into the knowledge base, and make it searchable by the AI."
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
