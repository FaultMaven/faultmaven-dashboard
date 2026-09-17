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
  /**
   * Whether this account may WRITE this row — edit it, and select it for a
   * batch delete.
   *
   * ONE predicate for both, because the server applies one policy to `PUT` and
   * `DELETE` alike. Two props would be two things that can drift, which is the
   * class of bug this exists to fix: a row offering Edit but no checkbox, or a
   * checkbox on a row the server will refuse, is the same mismatch in a
   * different place.
   */
  canWriteFn?: (doc: DocumentCardData) => boolean;
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
  canWriteFn,
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
          {/* The checkbox column is RESERVED even when this row has no
              checkbox. A mixed-ownership list is the normal case — a few
              global runbooks beside your own — and dropping the label makes
              those cards start ~28px to the left of the selectable ones, so
              the list renders ragged. */}
          {onToggleSelect && !(canWriteFn?.(doc) ?? true) && (
            <span className="flex-shrink-0 pt-2.5 pl-1 w-4" aria-hidden />
          )}
          {onToggleSelect && (canWriteFn?.(doc) ?? true) && (
            <label className="flex-shrink-0 pt-2.5 pl-1">
              <input
                type="checkbox"
                checked={selectedIds?.has(doc.document_id) ?? false}
                onChange={() => onToggleSelect(doc.document_id)}
                // The label wraps the input and carries no text, so without
                // this a screen reader announces twenty identical
                // "checkbox, not checked" rows.
                aria-label={`Select ${doc.title}`}
                className="w-4 h-4 rounded border-fm-border text-fm-accent focus:ring-fm-accent"
              />
            </label>
          )}
          <div className="flex-1 min-w-0">
            <DocumentCard
              document={doc}
              onDelete={onDelete}
              onUpdated={onUpdated}
              canEdit={canWriteFn ? canWriteFn(doc) : canEdit}
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
