import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logoutAuth, uploadAdminDocument, AdminKBDocument } from '../lib/api';
import { UploadZone } from '../components/UploadZone';
import { UploadModal } from '../components/UploadModal';
import { DocumentList } from '../components/DocumentList';
import { PageHeader } from '../components/PageHeader';
import { PaginationControls } from '../components/PaginationControls';
import { useKBList } from '../hooks/useKBList';
import { debounce } from '../utils/debounce';
import { ConfirmDialog } from '../components/ConfirmDialog';

export default function AdminKBPage() {
  const navigate = useNavigate();

  const {
    filteredDocuments,
    totalCount,
    loading,
    page,
    pageSize,
    search,
    setSearch,
    loadPage,
    deleteById,
  } = useKBList('admin');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    document_type: 'playbook',
    category: '',
    tags: '',
    description: '',
    source_url: '',
  });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  const handleLogout = async () => {
    try {
      await logoutAuth();
    } catch (error) {
      console.error('Logout error:', error);
    }
    navigate('/login');
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    const filename = file.name.replace(/\.[^/.]+$/, '');
    setUploadForm({ ...uploadForm, title: filename });
    setShowUploadModal(true);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);

    try {
      await uploadAdminDocument({
        file: selectedFile,
        title: uploadForm.title,
        document_type: uploadForm.document_type,
        category: uploadForm.category || undefined,
        tags: uploadForm.tags || undefined,
        description: uploadForm.description || undefined,
        source_url: uploadForm.source_url || undefined,
      });

      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadForm({
        title: '',
        document_type: 'playbook',
        category: '',
        tags: '',
        description: '',
        source_url: '',
      });
      await loadPage(page);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleCancelUpload = () => {
    setShowUploadModal(false);
    setSelectedFile(null);
    setUploadForm({
      title: '',
      document_type: 'playbook',
      category: '',
      tags: '',
      description: '',
      source_url: '',
    });
    setUploadError(null);
  };

  const handleDeleteDocument = (documentId: string) => {
    setConfirmDeleteId(documentId);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      setDeleteError(null);
      await deleteById(confirmDeleteId);
    } catch (error) {
      console.error('Failed to delete document:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete document';
      setDeleteError(message);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleSearchChange = useMemo(
    () =>
      debounce((value: string) => {
        setSearch(value);
      }, 200),
    [setSearch]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="FaultMaven Admin Dashboard"
        navButtons={[
          { label: 'My Knowledge Base', onClick: () => navigate('/kb'), variant: 'ghost' },
          { label: 'Global KB', active: true, variant: 'primary' },
        ]}
        onLogout={handleLogout}
      />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">System-Wide Knowledge Base</h2>
          <p className="text-gray-600">Manage system-wide playbooks, troubleshooting guides, and references visible to all users.</p>
        </div>

        <div className="flex items-center justify-between mb-4 gap-4">
          <input
            type="search"
            defaultValue={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search title or tags"
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            aria-label="Search admin documents"
          />
          <div className="text-sm text-gray-500">Total: {totalCount}</div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload System Document</h3>
          <UploadZone onFileSelected={handleFileSelect} accent="red" />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {deleteError && (
            <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
              {deleteError}
            </div>
          )}
          <DocumentList
            documents={filteredDocuments as AdminKBDocument[]}
            loading={loading}
            totalCount={totalCount}
            onDelete={handleDeleteDocument}
            accent="red"
            emptyMessage="No system documents yet"
          />
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={totalCount}
            onPageChange={(p) => loadPage(p)}
          />
        </div>
      </main>
      <ConfirmDialog
        isOpen={!!confirmDeleteId}
        title="Delete System Document"
        message="Are you sure you want to delete this system-wide document?"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <UploadModal
        isOpen={showUploadModal}
        title="Upload System Document"
        fileName={selectedFile?.name}
        errorMessage={uploadError}
        loading={uploading}
        onCancel={handleCancelUpload}
        onSubmit={handleUploadSubmit}
        submitLabel="Upload"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
          <input type="text" required value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent" placeholder="Enter document title" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Document Type <span className="text-red-500">*</span></label>
          <select required value={uploadForm.document_type} onChange={(e) => setUploadForm({ ...uploadForm, document_type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent">
            <option value="playbook">Playbook</option>
            <option value="troubleshooting_guide">Troubleshooting Guide</option>
            <option value="reference">Reference</option>
            <option value="how_to">How To</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <input type="text" value={uploadForm.category} onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent" placeholder="e.g. Infrastructure, Networking" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
          <input type="text" value={uploadForm.tags} onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent" placeholder="e.g. kubernetes, docker" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Source URL</label>
          <input type="url" value={uploadForm.source_url} onChange={(e) => setUploadForm({ ...uploadForm, source_url: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent" placeholder="https://example.com/original-doc" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent" rows={3} placeholder="Brief description of the document" />
        </div>
      </UploadModal>
    </div>
  );
}
