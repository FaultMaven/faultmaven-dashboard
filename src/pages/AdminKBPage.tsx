import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { logoutAuth } from '../lib/api';
import {
  uploadAdminDocument,
  listAdminDocuments,
  deleteAdminDocument,
  AdminKBDocument,
} from '../lib/adminApi';

export default function AdminKBPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Document state
  const [documents, setDocuments] = useState<AdminKBDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Upload modal state
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

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await listAdminDocuments({ limit: 50, offset: 0 });
      setDocuments(response.documents);
      setTotalCount(response.total_count);
    } catch (error) {
      console.error('Failed to load admin documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutAuth();
    } catch (error) {
      console.error('Logout error:', error);
    }
    navigate('/login');
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      const filename = file.name.replace(/\.[^/.]+$/, '');
      setUploadForm({ ...uploadForm, title: filename });
      setShowUploadModal(true);
    }
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
      await loadDocuments();
    } catch (error: any) {
      setUploadError(error.message || 'Upload failed');
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this system-wide document?')) {
      return;
    }

    try {
      await deleteAdminDocument(documentId);
      await loadDocuments();
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('Failed to delete document');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">FaultMaven Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex gap-2">
              <button onClick={() => navigate('/kb')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">My Knowledge Base</button>
              <button className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg">Admin KB</button>
            </nav>
            <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">System-Wide Knowledge Base</h2>
          <p className="text-gray-600">Manage system-wide playbooks, troubleshooting guides, and references visible to all users.</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload System Document</h3>
          <div onClick={handleUploadClick} className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-red-500 transition-colors cursor-pointer">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-700 font-medium mb-1">Click to upload or drag and drop</p>
            <p className="text-sm text-gray-500">Markdown, text, JSON, CSV, PDF, or DOC files (max 10MB)</p>
            <input ref={fileInputRef} type="file" className="hidden" accept=".md,.txt,.json,.csv,.pdf,.doc,.docx" onChange={handleFileChange} />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">System Documents {totalCount > 0 && `(${totalCount})`}</h3>
          </div>

          {loading ? (
            <div className="text-center py-12"><p className="text-gray-600">Loading documents...</p></div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-600 font-medium mb-2">No system documents yet</p>
              <p className="text-sm text-gray-500">Upload your first system document to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.document_id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{doc.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">{doc.document_type.replace('_', ' ')}</span>
                      {doc.tags.length > 0 && <span className="text-xs text-gray-500">{doc.tags.join(', ')}</span>}
                      <span className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteDocument(doc.document_id)} className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded">Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload System Document</h3>
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded"><strong>File:</strong> {selectedFile?.name}</div>
              
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

              {uploadError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">{uploadError}</div>}

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={handleCancelUpload} disabled={uploading} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={uploading} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">{uploading ? 'Uploading...' : 'Upload'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
