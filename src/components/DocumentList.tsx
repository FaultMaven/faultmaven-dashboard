import { useState } from 'react';
import { DocumentCard, DocumentCardData } from './DocumentCard';

interface DocumentListProps {
  documents: DocumentCardData[];
  loading: boolean;
  totalCount: number;
  emptyMessage?: string;
  onDelete: (id: string) => void;
  onUpdated?: () => void;
  canEdit?: boolean;
  canEditFn?: (doc: DocumentCardData) => boolean;
  canRemove?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function DocumentList({
  documents,
  loading,
  totalCount: _totalCount,
  emptyMessage = 'No runbooks yet',
  onDelete,
  onUpdated,
  canEdit,
  canEditFn,
  canRemove,
  selectedIds,
  onToggleSelect,
}: DocumentListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    <div className="space-y-1">
      {documents.map((doc) => (
        <div key={doc.document_id} className="flex items-start gap-2">
          {onToggleSelect && (
            <label className="flex-shrink-0 pt-2.5 pl-1">
              <input
                type="checkbox"
                checked={selectedIds?.has(doc.document_id) ?? false}
                onChange={() => onToggleSelect(doc.document_id)}
                className="w-4 h-4 rounded border-fm-border text-fm-accent focus:ring-fm-accent"
              />
            </label>
          )}
          <div className="flex-1 min-w-0">
            <DocumentCard
              document={doc}
              onDelete={onDelete}
              onUpdated={onUpdated}
              canEdit={canEditFn ? canEditFn(doc) : canEdit}
              canRemove={canRemove}
              isExpanded={expandedId === doc.document_id}
              onToggleExpand={() => setExpandedId(expandedId === doc.document_id ? null : doc.document_id)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
