import React, { useState } from "react";
import { KbDocument } from "../KnowledgeBaseView";

interface DocumentRowProps {
  document: KbDocument;
  onDelete: (id: string) => void;
}

export default function DocumentRow({ document, onDelete }: DocumentRowProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete "${document.name}"?`)) {
      setIsDeleting(true);
      try {
        await onDelete(document.id);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const getStatusBadge = (status: KbDocument['status']) => {
    const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    
    switch (status) {
      case 'Indexed':
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800`}>
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5"></div>
            Indexed
          </span>
        );
      case 'Processing':
        return (
          <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>
            <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full mr-1.5 animate-pulse"></div>
            Processing
          </span>
        );
      case 'Error':
        return (
          <span className={`${baseClasses} bg-red-100 text-red-800`}>
            <div className="w-1.5 h-1.5 bg-red-400 rounded-full mr-1.5"></div>
            Error
          </span>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'pdf':
        return (
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
        );
      case 'docx':
        return (
          <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
        );
      case 'md':
        return (
          <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  return (
    <tr className="hover:bg-gray-50">
      {/* Name */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center">
          <div className="flex-shrink-0 mr-3">
            {getFileIcon(document.name)}
          </div>
          <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
            {document.name}
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap">
        {getStatusBadge(document.status)}
      </td>

      {/* Date Added */}
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
        {formatDate(document.addedAt)}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDeleting ? (
            <div className="flex items-center space-x-1">
              <div className="animate-spin rounded-full h-3 w-3 border-b border-red-600"></div>
              <span>Deleting...</span>
            </div>
          ) : (
            'Delete'
          )}
        </button>
      </td>
    </tr>
  );
} 