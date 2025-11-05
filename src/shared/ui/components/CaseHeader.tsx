import React, { memo, useState, useRef, useEffect } from 'react';
import {
  UserCaseStatus,
  getValidTransitions,
  STATUS_LABELS,
  STATUS_DESCRIPTIONS,
  isTerminalStatus,
  normalizeStatus
} from '../../../lib/api';

interface UserCase {
  case_id: string;
  title: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

interface CaseHeaderProps {
  activeCase: UserCase | null;
  evidenceCount: number;
  evidencePanelExpanded: boolean;
  onToggleEvidence: () => void;
  onStatusChangeRequest?: (newStatus: UserCaseStatus) => void;
}

/**
 * Case Header Component
 *
 * Displays case information at the top of the chat window:
 * - Line 1: Case Name with label
 * - Line 2: Status with dropdown | Created date
 * - Line 3: Evidence count with expand/collapse toggle
 *
 * Phase 3 Week 7: Evidence Management + Status Dropdown
 */
export const CaseHeader: React.FC<CaseHeaderProps> = memo(({
  activeCase,
  evidenceCount,
  evidencePanelExpanded,
  onToggleEvidence,
  onStatusChangeRequest
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);

  if (!activeCase) {
    return null;
  }

  // Normalize status and get transitions
  const currentStatus = normalizeStatus(activeCase.status);
  const validTransitions = getValidTransitions(activeCase.status);
  const isTerminal = isTerminalStatus(activeCase.status);

  // Get status badge style
  const getStatusBadgeStyle = (status: UserCaseStatus): string => {
    const styles: Record<UserCaseStatus, string> = {
      consulting: 'text-blue-700 bg-blue-100 border-blue-200',
      investigating: 'text-yellow-700 bg-yellow-100 border-yellow-200',
      resolved: 'text-green-700 bg-green-100 border-green-200',
      closed: 'text-gray-700 bg-gray-100 border-gray-200'
    };
    return styles[status] || styles.consulting;
  };

  // Handle status change selection
  const handleStatusChange = (newStatus: UserCaseStatus) => {
    setIsDropdownOpen(false);
    if (onStatusChangeRequest) {
      onStatusChangeRequest(newStatus);
    }
  };

  // Format date in compact format
  const formatCompactDate = (dateString?: string): string => {
    if (!dateString) return 'Unknown';

    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Unknown';
    }
  };

  // Format relative time (e.g., "2h ago")
  const formatRelativeTime = (dateString?: string): string => {
    if (!dateString) return 'Unknown';

    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return formatCompactDate(dateString);
    } catch {
      return 'Unknown';
    }
  };

  const openedDate = formatCompactDate(activeCase.created_at);
  const updatedTime = formatRelativeTime(activeCase.updated_at);
  const displayTitle = activeCase.title === 'Loading...' ? 'New Case' : activeCase.title;

  return (
    <div className="case-header bg-white border-b border-gray-200 px-4 py-3">
      {/* Line 1: Case Title with Menu Button */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-base font-semibold text-gray-900">
          {displayTitle}
        </h1>
        <button
          className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
          title="Case options"
          aria-label="Case options menu"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      </div>

      {/* Line 2: Status • Opened • Updated • Evidence */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        {/* Status with dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            className={`
              inline-flex items-center gap-1 font-medium
              ${isTerminal ? 'cursor-not-allowed' : 'hover:underline cursor-pointer'}
            `}
            onClick={() => !isTerminal && setIsDropdownOpen(!isDropdownOpen)}
            disabled={isTerminal}
            title={isTerminal ? 'Terminal state - cannot be changed' : 'Click to change status'}
            aria-label={`Status: ${STATUS_LABELS[currentStatus]}${!isTerminal ? '. Click to change' : ''}`}
            aria-expanded={isDropdownOpen}
          >
            <span>{STATUS_LABELS[currentStatus]}</span>
            {!isTerminal && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && !isTerminal && validTransitions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
              <div className="px-2 py-1 text-xs text-gray-500 font-medium border-b border-gray-100">
                Change to:
              </div>
              {validTransitions.map((status) => (
                <button
                  key={status}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  onClick={() => handleStatusChange(status)}
                  title={STATUS_DESCRIPTIONS[status]}
                >
                  <span className="text-gray-400">→</span>
                  <span className="font-medium text-gray-900">{STATUS_LABELS[status]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-gray-400">•</span>

        {/* Opened date */}
        <span>Opened {openedDate}</span>

        <span className="text-gray-400">•</span>

        {/* Updated time */}
        <span>Updated {updatedTime}</span>

        <span className="text-gray-400">•</span>

        {/* Evidence count with toggle */}
        {evidenceCount > 0 ? (
          <button
            onClick={onToggleEvidence}
            className="inline-flex items-center gap-1 hover:underline cursor-pointer"
            aria-expanded={evidencePanelExpanded}
            aria-controls="evidence-panel"
            title={`${evidenceCount} evidence ${evidenceCount === 1 ? 'item' : 'items'}. Click to ${evidencePanelExpanded ? 'collapse' : 'expand'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <span>{evidenceCount} evidence</span>
            <svg className={`w-3 h-3 transition-transform ${evidencePanelExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <span>0 evidence</span>
          </span>
        )}
      </div>
    </div>
  );
});

CaseHeader.displayName = 'CaseHeader';
