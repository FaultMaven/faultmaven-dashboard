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
  totalCount: _totalCount,
  emptyMessage = 'No runbooks yet',
  onDelete,
  onUpdated,
}: DocumentListProps) {
  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-fm-text-tertiary">Loading runbooks...</p>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-fm-text-secondary font-medium mb-1">{emptyMessage}</p>
        <p className="text-sm text-fm-text-tertiary">Add your first runbook to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <DocumentCard key={doc.document_id} document={doc} onDelete={onDelete} onUpdated={onUpdated} />
      ))}
    </div>
  );
}
