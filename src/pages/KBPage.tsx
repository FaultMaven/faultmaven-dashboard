import React, { useMemo, useState } from 'react';
import { logoutAuth, uploadDocument, type KBDocument, type AdminKBDocument } from '../lib/api';
import {
  convertDocument,
  updateDraft,
  verifyDraft,
  deleteDraft,
  createRunbookManually,
  ConversionAPIError,
} from '../lib/knowledge/conversion';
import type { ConversionResponse, ConversionDraft, ConversionErrorInfo } from '../lib/knowledge/conversion';
import { UploadZone } from '../components/UploadZone';
import { UploadModal } from '../components/UploadModal';
import { DocumentList } from '../components/DocumentList';
import { PageHeader } from '../components/PageHeader';
import { PaginationControls } from '../components/PaginationControls';
import { KBTabs, type KBTier } from '../components/KBTabs';
import { ConvertUpload } from '../components/ConvertUpload';
import { ConversionResults } from '../components/ConversionResults';
import { DraftEditor } from '../components/DraftEditor';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CreateRunbookForm, type RunbookFormData } from '../components/CreateRunbookForm';
import { useKBList } from '../hooks/useKBList';
import { debounce } from '../utils/debounce';
import { useAuth } from '../context/AuthContext';

const inputClass = 'w-full px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

type UploadFormState = {
  title: string;
  document_type: string;
  tags: string;
  description: string;
};

const emptyForm: UploadFormState = { title: '', document_type: 'playbook', tags: '', description: '' };

// =============================================================================
// Conversion Flow (self-contained state machine)
// =============================================================================

type ConversionView = 'menu' | 'upload' | 'results' | 'editor' | 'manual';

function ConversionFlow() {
  const [view, setView] = useState<ConversionView>('menu');
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<ConversionErrorInfo | null>(null);
  const [conversion, setConversion] = useState<ConversionResponse | null>(null);
  const [editingDraft, setEditingDraft] = useState<ConversionDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmVerify, setConfirmVerify] = useState<ConversionDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConversionDraft | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const handleConvert = async (file: File, scope: string, teamId?: string) => {
    setConverting(true);
    setConvertError(null);
    try {
      const result = await convertDocument(file, scope, teamId);
      setConversion(result);
      setView('results');
    } catch (err: unknown) {
      if (err instanceof ConversionAPIError) {
        setConvertError(err.errorInfo);
      } else {
        setConvertError({
          title: 'Conversion failed',
          message: err instanceof Error ? err.message : 'An unexpected error occurred.',
          action: 'Try again with a different document.',
        });
      }
    } finally {
      setConverting(false);
    }
  };

  const handleEdit = (draft: ConversionDraft) => {
    setEditingDraft(draft);
    setView('editor');
  };

  const handleSaveDraft = async (content: string): Promise<ConversionDraft | null> => {
    if (!conversion || !editingDraft) return null;
    setSaving(true);
    try {
      const updated = await updateDraft(conversion.conversion_id, editingDraft.draft_id, content);
      // Update the draft in the conversion results
      setConversion((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          drafts: prev.drafts.map((d) => (d.draft_id === updated.draft_id ? updated : d)),
        };
      });
      setEditingDraft(updated);
      return updated;
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyConfirmed = async () => {
    if (!conversion || !confirmVerify) return;
    try {
      await verifyDraft(conversion.conversion_id, confirmVerify.draft_id);
      // Update draft status in local state
      setConversion((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          drafts: prev.drafts.map((d) =>
            d.draft_id === confirmVerify.draft_id ? { ...d, status: 'verified' as const } : d,
          ),
        };
      });
    } catch (err: unknown) {
      setConvertError({
        title: 'Verification failed',
        message: err instanceof Error ? err.message : 'Could not verify the draft.',
        action: 'Try again or check the API logs.',
      });
    } finally {
      setConfirmVerify(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!conversion || !confirmDelete) return;
    try {
      await deleteDraft(conversion.conversion_id, confirmDelete.draft_id);
      setConversion((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          drafts: prev.drafts.filter((d) => d.draft_id !== confirmDelete.draft_id),
        };
      });
    } catch (err: unknown) {
      setConvertError({
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Could not delete the draft.',
        action: 'Try again.',
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleManualCreate = async (data: RunbookFormData) => {
    setManualLoading(true);
    setManualError(null);
    try {
      const result = await createRunbookManually(data);
      // Build a minimal ConversionResponse so the editor/verify flow works
      setConversion({
        conversion_id: result.conversion_id,
        status: 'completed',
        source_file: { filename: 'manual-creation', size_bytes: 0, content_type: 'text/markdown', retained_path: '' },
        analysis: { is_actionable: true, failure_modes: [], source_assessment: { content_type: 'manual', actionability_rating: 'high', missing_information: [] } },
        drafts: [result.draft],
        warnings: [],
        created_at: new Date().toISOString(),
      });
      setEditingDraft(result.draft);
      setView('editor');
    } catch (err: unknown) {
      setManualError(err instanceof Error ? err.message : 'Failed to create runbook');
    } finally {
      setManualLoading(false);
    }
  };

  const handleBack = () => {
    if (view === 'editor') {
      setEditingDraft(null);
      setView('results');
    } else {
      setConversion(null);
      setConvertError(null);
      setManualError(null);
      setView('menu');
    }
  };

  return (
    <div className="bg-fm-surface rounded-fm-card border border-fm-border p-6 mb-6">
      {view === 'menu' && (
        <div>
          <h3 className="text-lg font-semibold text-fm-text-primary mb-4">Create Runbooks</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setView('upload')}
              className="p-4 text-left border border-fm-border rounded-fm-card hover:border-fm-accent hover:bg-fm-surface-alt transition-colors"
            >
              <p className="font-medium text-fm-text-primary mb-1">Convert Document</p>
              <p className="text-sm text-fm-text-secondary">
                Upload a PDF, DOCX, or text file and let AI extract runbooks from it automatically.
              </p>
            </button>
            <button
              onClick={() => setView('manual')}
              className="p-4 text-left border border-fm-border rounded-fm-card hover:border-fm-accent hover:bg-fm-surface-alt transition-colors"
            >
              <p className="font-medium text-fm-text-primary mb-1">Create Manually</p>
              <p className="text-sm text-fm-text-secondary">
                Write a runbook from scratch using the standard template with guided sections.
              </p>
            </button>
          </div>
        </div>
      )}

      {view === 'upload' && (
        <ConvertUpload
          onConvert={handleConvert}
          loading={converting}
          error={convertError}
        />
      )}

      {view === 'results' && conversion && (
        <ConversionResults
          conversion={conversion}
          onEdit={handleEdit}
          onVerify={(draft) => setConfirmVerify(draft)}
          onDelete={(draft) => setConfirmDelete(draft)}
          onBack={handleBack}
        />
      )}

      {view === 'editor' && editingDraft && (
        <DraftEditor
          draft={editingDraft}
          onSave={handleSaveDraft}
          onVerify={() => setConfirmVerify(editingDraft)}
          onCancel={handleBack}
          saving={saving}
        />
      )}

      {view === 'manual' && (
        <CreateRunbookForm
          onSubmit={handleManualCreate}
          onCancel={handleBack}
          loading={manualLoading}
          error={manualError}
        />
      )}

      {/* Verify confirmation */}
      <ConfirmDialog
        isOpen={!!confirmVerify}
        title="Verify & Ingest Runbook"
        message="This will set the runbook status to verified, set verified_by to your username, ingest it into the knowledge base, and make it searchable by the AI."
        confirmLabel="Confirm"
        onConfirm={handleVerifyConfirmed}
        onCancel={() => setConfirmVerify(null)}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete Draft"
        message="Delete this draft? The runbook file will be removed. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// =============================================================================
// KB Tab Content (existing, with conversion flow added)
// =============================================================================

interface KBTabContentProps {
  scope: 'user' | 'admin';
  readOnly?: boolean;
  onUpload?: (params: { file: File } & UploadFormState) => Promise<void>;
}

function KBTabContent({ scope, readOnly = false, onUpload }: KBTabContentProps) {
  const { filteredDocuments, totalCount, loading, page, pageSize, search, setSearch, loadPage, deleteById } =
    useKBList(scope);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState<UploadFormState>(emptyForm);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const handleSearchChange = useMemo(
    () => debounce((value: string) => setSearch(value), 200),
    [setSearch]
  );

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    const filename = file.name.replace(/\.[^/.]+$/, '');
    setUploadForm({ ...emptyForm, title: filename });
    setShowUploadModal(true);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !onUpload) return;
    setUploading(true);
    setUploadError(null);
    try {
      await onUpload({ file: selectedFile, ...uploadForm });
      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadForm(emptyForm);
      await loadPage(page);
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleCancelUpload = () => {
    setShowUploadModal(false);
    setSelectedFile(null);
    setUploadForm(emptyForm);
    setUploadError(null);
  };

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
        <input
          type="search"
          defaultValue={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search title or tags"
          className={`max-w-md ${inputClass}`}
          aria-label="Search documents"
        />
        <div className="text-sm text-fm-text-tertiary">Total: {totalCount}</div>
      </div>

      {!readOnly && (
        <div className="bg-fm-surface rounded-fm-card border border-fm-border p-6 mb-6">
          <h3 className="text-lg font-semibold text-fm-text-primary mb-4">Upload Documents</h3>
          <UploadZone onFileSelected={handleFileSelect} />
        </div>
      )}

      {/* Document-to-Runbook Conversion */}
      {!readOnly && (
        <ConversionFlow />
      )}

      <div className="bg-fm-surface rounded-fm-card border border-fm-border p-6">
        {archiveError && (
          <div className="mb-3 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border rounded-fm-btn p-3">
            {archiveError}
          </div>
        )}
        <DocumentList
          documents={filteredDocuments as (KBDocument | AdminKBDocument)[]}
          loading={loading}
          totalCount={totalCount}
          onDelete={readOnly ? () => {} : (id) => setConfirmArchiveId(id)}
          emptyMessage="No documents yet"
        />
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={totalCount}
          onPageChange={(p) => loadPage(p)}
        />
      </div>

      <ConfirmDialog
        isOpen={!!confirmArchiveId}
        title="Archive Document"
        message="Archive this document? It will be removed from search results but referenced in past cases."
        confirmLabel="Archive"
        onConfirm={confirmArchive}
        onCancel={() => setConfirmArchiveId(null)}
      />

      {!readOnly && (
        <UploadModal
          isOpen={showUploadModal}
          title="Upload Document"
          fileName={selectedFile?.name}
          errorMessage={uploadError}
          loading={uploading}
          onCancel={handleCancelUpload}
          onSubmit={handleUploadSubmit}
        >
          <div>
            <label className="block text-sm font-medium text-fm-text-secondary mb-1">
              Title <span className="text-fm-critical">*</span>
            </label>
            <input
              type="text"
              required
              value={uploadForm.title}
              onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
              className={inputClass}
              placeholder="Enter document title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fm-text-secondary mb-1">
              Document Type <span className="text-fm-critical">*</span>
            </label>
            <select
              required
              value={uploadForm.document_type}
              onChange={(e) => setUploadForm({ ...uploadForm, document_type: e.target.value })}
              className={inputClass}
            >
              <option value="playbook">Playbook</option>
              <option value="troubleshooting_guide">Troubleshooting Guide</option>
              <option value="reference">Reference</option>
              <option value="how_to">How-To</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-fm-text-secondary mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={uploadForm.tags}
              onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })}
              className={inputClass}
              placeholder="e.g. kubernetes, docker, networking"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fm-text-secondary mb-1">
              Description
            </label>
            <textarea
              value={uploadForm.description}
              onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
              className={inputClass}
              rows={3}
              placeholder="Brief description of the document"
            />
          </div>
        </UploadModal>
      )}
    </>
  );
}

// =============================================================================
// KBPage (main export)
// =============================================================================

export default function KBPage() {
  const { deployment, role, clearAuthState } = useAuth();
  const isAdmin = role === 'platform_admin';
  const isCloud = deployment === 'cloud';
  // Upload requires admin on the backend. Local users are always admin (single-user).
  const canUpload = deployment === 'local' || isAdmin;

  const availableTabs: KBTier[] = isCloud ? ['personal', 'team', 'global'] : ['personal'];
  const [activeTab, setActiveTab] = useState<KBTier>('personal');

  const handleLogout = async () => {
    await logoutAuth();
    await clearAuthState();
  };

  // Both personal and global tabs hit the same backend endpoint.
  // Upload is gated on canUpload (local user or platform_admin).
  const handleUpload = async (params: { file: File; title: string; document_type: string; tags: string; description: string }) => {
    await uploadDocument({
      file: params.file,
      title: params.title,
      document_type: params.document_type,
      tags: params.tags,
      description: params.description,
    });
  };

  const tabTitle: Record<KBTier, string> = {
    personal: 'My Knowledge Base',
    team: 'Team Knowledge Base',
    global: 'Global Knowledge Base',
  };

  const tabDescription: Record<KBTier, string> = {
    personal: 'Upload and manage your personal runbooks, documentation, and troubleshooting guides.',
    team: 'Shared knowledge base for your organization.',
    global: 'Platform-wide knowledge base accessible to all users.',
  };

  return (
    <div className="min-h-screen bg-fm-canvas">
      <PageHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-fm-heading font-bold text-fm-text-primary mb-2">{tabTitle[activeTab]}</h2>
          <p className="text-fm-text-secondary">{tabDescription[activeTab]}</p>
        </div>

        <KBTabs activeTab={activeTab} availableTabs={availableTabs} onChange={setActiveTab} />

        {activeTab === 'personal' && (
          <KBTabContent
            scope="user"
            readOnly={!canUpload}
            onUpload={canUpload ? handleUpload : undefined}
          />
        )}

        {activeTab === 'team' && (
          <div className="bg-fm-surface rounded-fm-card border border-fm-border p-8 text-center">
            <p className="text-fm-text-secondary text-sm">
              Team Knowledge Base is coming soon. Your organization's shared runbooks and documentation will appear here.
            </p>
          </div>
        )}

        {activeTab === 'global' && (
          <KBTabContent
            scope="admin"
            readOnly={!isAdmin}
            onUpload={isAdmin ? handleUpload : undefined}
          />
        )}
      </main>
    </div>
  );
}
