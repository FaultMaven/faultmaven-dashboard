import React, { memo } from 'react';
import { UploadedData } from '../../../lib/api';

interface RemoveEvidenceDialogProps {
  evidence: UploadedData | null;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isRemoving?: boolean;
  errorMessage?: string | null;
}

/**
 * Remove Evidence Confirmation Dialog
 *
 * Displays confirmation dialog before removing evidence from a case:
 * - Shows evidence name
 * - Explains consequences (no longer queryable)
 * - Clarifies original file not affected
 * - Provides Cancel/Remove actions
 *
 * Phase 3 Week 7: Evidence Management
 */
export const RemoveEvidenceDialog: React.FC<RemoveEvidenceDialogProps> = memo(({
  evidence,
  isOpen,
  onConfirm,
  onCancel,
  isRemoving = false,
  errorMessage = null
}) => {
  if (!isOpen || !evidence) {
    return null;
  }

  // Handle backdrop click to cancel
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isRemoving) {
      onCancel();
    }
  };

  // Handle keyboard events (Escape to cancel, Enter to confirm)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isRemoving) return;

    if (e.key === 'Escape') {
      onCancel();
    }
  };

  const evidenceName = evidence.file_name || 'Pasted Content';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-dialog-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header with warning icon */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-200">
          <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h2 id="remove-dialog-title" className="text-lg font-semibold text-gray-900">
              Remove Evidence?
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-700">
            Remove <span className="font-semibold">{evidenceName}</span> from this case?
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <p className="text-sm text-amber-900 font-medium">
              This action will:
            </p>
            <ul className="text-sm text-amber-800 space-y-1 ml-4">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 mt-1">•</span>
                <span>Remove evidence from this case</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 mt-1">•</span>
                <span>Make queries about this data unavailable</span>
              </li>
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900">
              <span className="font-medium">Note:</span> This won't affect the original file,
              but queries about it will no longer work.
            </p>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">Error Removing Evidence</p>
                  <p className="text-sm text-red-800 mt-1">{errorMessage}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onCancel}
            disabled={isRemoving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isRemoving}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-red-600 rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isRemoving ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Removing...
              </>
            ) : (
              'Remove'
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

RemoveEvidenceDialog.displayName = 'RemoveEvidenceDialog';
