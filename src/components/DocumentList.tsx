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

  /**
   * The placeholder replaces the list only when there is NOTHING to replace.
   *
   * `loading` is true for a REFETCH as well as a first load, and swapping the
   * rows out for this line unmounts every card. A `DocumentCard` holds the
   * document body in local state seeded from `document.content` — which a LIST
   * ROW does not carry (`KBDocumentListItem`, #165) — so a card that is
   * remounted mid-refetch comes back expanded and empty, rendering
   * "No content available." in place of what the user was reading.
   *
   * That is not hypothetical: it is what made an in-card save appear to VANISH
   * once `onUpdated` started firing a refetch. Keeping the rows mounted means
   * React reconciles them by `key={doc.document_id}`, the card instance
   * survives, and the body the user just saved stays on screen while the fresh
   * page arrives behind it.
   */
  if (loading && documents.length === 0) {
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
