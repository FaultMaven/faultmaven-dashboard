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
  accent?: 'blue' | 'red';
  actionLabel?: string;
}

export function DocumentCard({ document, onDelete, accent = 'blue', actionLabel = 'Delete' }: DocumentCardProps) {
  const pillClass =
    accent === 'red'
      ? 'text-red-700 bg-red-100'
      : 'text-blue-700 bg-blue-100';
  const actionClass =
    accent === 'red'
      ? 'text-red-600 hover:bg-red-50'
      : 'text-blue-600 hover:bg-blue-50';
  return (
    <div
      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
    >
      <div className="flex-1">
        <h4 className="font-medium text-gray-900">{document.title}</h4>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs px-2 py-1 rounded ${pillClass}`}>
            {document.document_type.replace('_', ' ')}
          </span>
          {document.tags.length > 0 && (
            <span className="text-xs text-gray-500">
              {document.tags.join(', ')}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {new Date(document.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      <button
        onClick={() => onDelete(document.document_id)}
        className={`px-3 py-1 text-sm rounded ${actionClass}`}
      >
        {actionLabel}
      </button>
    </div>
  );
}
