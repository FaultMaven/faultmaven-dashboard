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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-fm-surface border border-fm-border rounded-fm-card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-fm-card">
        <h3 className="text-lg font-semibold text-fm-text-primary mb-4" id="upload-modal-title">{title}</h3>

        <form onSubmit={onSubmit} className="space-y-4" aria-labelledby="upload-modal-title">
          {fileName && (
            <div className="text-sm text-fm-text-secondary bg-fm-elevated p-3 rounded-fm-btn" data-testid="upload-file-name">
              <strong>File:</strong> {fileName}
            </div>
          )}

          {children}

          {errorMessage && (
            <div className="text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border p-3 rounded-fm-btn">
              {errorMessage}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated disabled:opacity-50 transition-colors"
              autoFocus
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Uploading...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
