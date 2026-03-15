export interface DocumentCardData {
  document_id: string;
  title: string;
  document_type: string;
  tags: string[];
  created_at: string;
}

interface DocumentCardProps {
  document: DocumentCardData;
  onDelete: (id: string) => void;
  actionLabel?: string;
}

export function DocumentCard({ document, onDelete, actionLabel = 'Delete' }: DocumentCardProps) {
  return (
    <div className="flex items-center justify-between p-4 border border-fm-border rounded-fm-card hover:bg-fm-elevated transition-colors">
      <div className="flex-1">
        <h4 className="font-medium text-fm-text-primary">{document.title}</h4>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-fm-xs px-2 py-0.5 rounded-fm-chip bg-fm-accent-soft text-fm-accent">
            {document.document_type.replace('_', ' ')}
          </span>
          {document.tags.length > 0 && (
            <span className="text-fm-xs text-fm-text-tertiary">
              {document.tags.join(', ')}
            </span>
          )}
          <span className="text-fm-xs text-fm-text-tertiary">
            {new Date(document.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      <button
        onClick={() => onDelete(document.document_id)}
        className="px-3 py-1 text-sm rounded-fm-btn text-fm-critical hover:bg-fm-critical-bg transition-colors"
      >
        {actionLabel}
      </button>
    </div>
  );
}
