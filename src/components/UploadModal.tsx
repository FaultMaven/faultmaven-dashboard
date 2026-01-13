interface UploadModalProps {
  isOpen: boolean;
  title: string;
  fileName?: string;
  errorMessage?: string | null;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
}

export function UploadModal({
  isOpen,
  title,
  fileName,
  errorMessage,
  loading = false,
  onCancel,
  onSubmit,
  children,
  submitLabel = 'Upload',
  cancelLabel = 'Cancel',
}: UploadModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-lg">
        <h3 className="text-lg font-semibold text-gray-900 mb-4" id="upload-modal-title">{title}</h3>

        <form onSubmit={onSubmit} className="space-y-4" aria-labelledby="upload-modal-title">
          {fileName && (
            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded" data-testid="upload-file-name">
              <strong>File:</strong> {fileName}
            </div>
          )}

          {children}

          {errorMessage && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">
              {errorMessage}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              autoFocus
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Uploading...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}










