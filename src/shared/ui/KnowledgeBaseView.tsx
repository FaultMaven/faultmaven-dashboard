import React, { useState, useEffect } from "react";
import UploadArea from "./components/UploadArea";
import DocumentTable from "./components/DocumentTable";
import { ErrorState } from "./components/ErrorState";
import { uploadKnowledgeDocument, getKnowledgeDocuments, deleteKnowledgeDocument } from "../../lib/api";

export interface KbDocument {
  id: string;
  name: string;
  status: 'Processing' | 'Indexed' | 'Error';
  addedAt: string;
}

export default function KnowledgeBaseView() {
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const docs = await getKnowledgeDocuments();
      setDocuments(docs);
    } catch (err: any) {
      console.error("[KnowledgeBaseView] Error fetching documents:", err);
      setError('Could not load documents. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleUpload = async (files: File[]) => {
    setError(null);
    const newDocuments: KbDocument[] = [];

    // Optimistically add files with "Processing" status
    for (const file of files) {
      const newDoc: KbDocument = {
        id: `temp-${Date.now()}-${Math.random()}`,
        name: file.name,
        status: 'Processing',
        addedAt: new Date().toISOString()
      };
      newDocuments.push(newDoc);
    }

    setDocuments(prev => [...newDocuments, ...prev]);

    // Upload each file
    for (let i = 0; i < files.length; i++) {
      try {
        const uploadedDoc = await uploadKnowledgeDocument(files[i]);
        // Replace the temporary document with the real one
        setDocuments(prev => prev.map(doc => 
          doc.id === newDocuments[i].id ? uploadedDoc : doc
        ));
      } catch (err: any) {
        console.error(`[KnowledgeBaseView] Error uploading ${files[i].name}:`, err);
        // Update the document status to Error
        setDocuments(prev => prev.map(doc => 
          doc.id === newDocuments[i].id 
            ? { ...doc, status: 'Error' as const }
            : doc
        ));
        setError(`Failed to upload ${files[i].name}: ${err.message}`);
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteKnowledgeDocument(id);
      setDocuments(prev => prev.filter(doc => doc.id !== id));
    } catch (err: any) {
      console.error("[KnowledgeBaseView] Error deleting document:", err);
      setError(`Failed to delete document: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Knowledge Base</h2>
        <p className="text-sm text-gray-600">
          Upload documents to build your offline knowledge base for AI-powered troubleshooting.
        </p>
      </div>

      {/* Upload Area */}
      <UploadArea onUpload={handleUpload} />

      {/* Document Table or Error State */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="text-sm text-gray-600">Loading documents...</span>
            </div>
          </div>
        ) : error ? (
          <ErrorState 
            message={error} 
            onRetry={fetchDocuments}
            title="Could not load documents"
          />
        ) : (
          <DocumentTable 
            documents={documents} 
            onDelete={handleDelete}
            loading={false}
          />
        )}
      </div>
    </div>
  );
} 