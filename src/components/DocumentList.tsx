import { DocumentCard, DocumentCardData } from './DocumentCard';

interface DocumentListProps {
  documents: DocumentCardData[];
  loading: boolean;
  totalCount: number;
  emptyMessage?: string;
  onDelete: (id: string) => void;
  onUpdated?: () => void;
}

export function DocumentList({
  documents,
  loading,
  totalCount,
  emptyMessage = 'No documents yet',
  onDelete,
  onUpdated,
}: DocumentListProps) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-fm-text-secondary">Loading documents...</p>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 text-fm-text-tertiary mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-fm-text-secondary font-medium mb-2">{emptyMessage}</p>
        <p className="text-sm text-fm-text-tertiary">Add your first runbook to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <DocumentCard key={doc.document_id} document={doc} onDelete={onDelete} onUpdated={onUpdated} />
      ))}
    </div>
  );
}
