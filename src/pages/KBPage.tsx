import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { logoutAuth } from '../lib/api';

export default function KBPage() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check if user is admin
    const authState = localStorage.getItem('faultmaven_authState');
    if (authState) {
      try {
        const parsed = JSON.parse(authState);
        const isUserAdmin = parsed.user?.roles?.includes('admin') || parsed.user?.is_admin || false;
        setIsAdmin(isUserAdmin);
      } catch {
        setIsAdmin(false);
      }
    }
  }, []);

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
      console.log('Selected files:', Array.from(files).map(f => f.name));
      // TODO: Implement file upload logic
      alert(`Selected ${files.length} file(s). Upload functionality coming soon!`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">FaultMaven Dashboard</h1>
          </div>

          <div className="flex items-center gap-4">
            <nav className="flex gap-2">
              <button
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg"
              >
                My Knowledge Base
              </button>
              {isAdmin && (
                <button
                  onClick={() => navigate('/admin/kb')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Admin KB
                </button>
              )}
            </nav>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">My Knowledge Base</h2>
          <p className="text-gray-600">
            Upload and manage your personal runbooks, documentation, and troubleshooting guides.
          </p>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Documents</h3>
          <div
            onClick={handleUploadClick}
            className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 transition-colors cursor-pointer"
          >
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-gray-700 font-medium mb-1">Click to upload or drag and drop</p>
            <p className="text-sm text-gray-500">Markdown, text, JSON, CSV, or log files</p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".md,.txt,.json,.csv,.log"
              multiple
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Documents List */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Your Documents</h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search documents..."
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Empty State */}
          <div className="text-center py-12">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-gray-600 font-medium mb-2">No documents yet</p>
            <p className="text-sm text-gray-500">Upload your first document to get started</p>
          </div>
        </div>
      </main>
    </div>
  );
}
