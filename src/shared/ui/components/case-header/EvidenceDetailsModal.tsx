/**
 * EvidenceDetailsModal Component
 *
 * Modal displaying derived evidence details for an uploaded file
 * Shows evidence items linked to the file with hypothesis relationships
 */

import React from 'react';
import type { UploadedFileDetailsResponse, DerivedEvidenceSummary } from '../../../../types/case';

interface EvidenceDetailsModalProps {
  isOpen: boolean;
  evidenceDetails: UploadedFileDetailsResponse | null;
  evidenceLoading: boolean;
  onClose: () => void;
  onScrollToTurn?: (turnNumber: number) => void;
}

export const EvidenceDetailsModal: React.FC<EvidenceDetailsModalProps> = ({
  isOpen,
  evidenceDetails,
  evidenceLoading,
  onClose,
  onScrollToTurn,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Evidence Derived from File
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {evidenceLoading && (
            <p className="text-sm text-gray-500 italic">Loading evidence details...</p>
          )}

          {!evidenceLoading && evidenceDetails && (
            <>
              {/* File Info */}
              <div className="mb-4 pb-4 border-b border-gray-200">
                <div className="text-sm font-medium text-gray-900 mb-1">
                  📄 {evidenceDetails.filename}
                </div>
                <div className="text-xs text-gray-600">
                  Uploaded at Turn {evidenceDetails.uploaded_at_turn}
                  {onScrollToTurn && (
                    <>
                      {' · '}
                      <button
                        onClick={() => onScrollToTurn(evidenceDetails.uploaded_at_turn)}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        title="Jump to turn in conversation"
                      >
                        View in Chat
                      </button>
                    </>
                  )}
                </div>
                {evidenceDetails.summary && (
                  <div className="text-xs text-gray-700 mt-2 italic">
                    {evidenceDetails.summary}
                  </div>
                )}
              </div>

              {/* Evidence List */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-700">
                  Derived Evidence ({evidenceDetails.derived_evidence?.length || 0})
                </h4>

                {!evidenceDetails.derived_evidence || evidenceDetails.derived_evidence.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">
                    No evidence items found for this file.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {evidenceDetails.derived_evidence.map((evidence: DerivedEvidenceSummary, index: number) => (
                      <div
                        key={evidence.evidence_id}
                        className="p-3 bg-gray-50 rounded-md border border-gray-200"
                      >
                        {/* Evidence Summary */}
                        <div className="text-sm text-gray-900 mb-2">
                          {evidence.summary}
                        </div>

                        {/* Evidence Metadata */}
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          {/* Category */}
                          {evidence.category && (
                            <span className="font-medium capitalize">
                              {evidence.category.replace(/_/g, ' ')}
                            </span>
                          )}

                          {/* Related Hypotheses Count */}
                          {evidence.related_hypothesis_ids && evidence.related_hypothesis_ids.length > 0 && (
                            <span className="text-purple-600">
                              🔬 {evidence.related_hypothesis_ids.length} hypothesis{evidence.related_hypothesis_ids.length > 1 ? 'es' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {!evidenceLoading && !evidenceDetails && (
            <p className="text-sm text-red-600">Failed to load evidence details.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
