import { DocumentCard, DocumentCardData } from './DocumentCard';

interface DocumentListProps {
  documents: DocumentCardData[];
  loading: boolean;
  totalCount: number;
  emptyMessage?: string;
  accent?: 'blue' | 'red';
  onDelete: (id: string) => void;
}

export function DocumentList({
  documents,
  loading,
  totalCount,
  emptyMessage = 'No documents yet',
  accent = 'blue',
  onDelete,
}: DocumentListProps) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading documents...</p>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-gray-600 font-medium mb-2">{emptyMessage}</p>
        <p className="text-sm text-gray-500">Upload your first document to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-900">
          Documents {totalCount > 0 && `(${totalCount})`}
        </h3>
      </div>
      {documents.map((doc) => (
        <DocumentCard key={doc.document_id} document={doc} onDelete={onDelete} accent={accent} />
      ))}
    </div>
  );
}
