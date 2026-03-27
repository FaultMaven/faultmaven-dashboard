import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { getDocument } from '../lib/knowledge/kb';

export interface DocumentCardData {
  document_id: string;
  title: string;
  document_type: string;
  tags: string[];
  scope?: string;
  created_at: string;
  content?: string;
}

interface DocumentCardProps {
  document: DocumentCardData;
  onDelete: (id: string) => void;
  actionLabel?: string;
}

export function DocumentCard({ document, onDelete, actionLabel = 'Archive' }: DocumentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<string | null>(document.content || null);
  const [loadingContent, setLoadingContent] = useState(false);

  const handleToggle = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (!content) {
      setLoadingContent(true);
      try {
        const doc = await getDocument(document.document_id);
        setContent(doc.content);
      } catch {
        setContent('[Failed to load content]');
      } finally {
        setLoadingContent(false);
      }
    }
    setExpanded(true);
  };

  return (
    <div className="border border-fm-border rounded-fm-card hover:bg-fm-elevated transition-colors">
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggle(); }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 text-fm-text-tertiary flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <h4 className="font-medium text-fm-text-primary truncate">{document.title}</h4>
          </div>
          <div className="flex items-center gap-2 mt-1 ml-6">
            <span className="text-fm-xs px-2 py-0.5 rounded-fm-chip bg-fm-accent-soft text-fm-accent">
              {document.document_type.replace('_', ' ')}
            </span>
            {document.scope && (
              <span className={`text-fm-xs px-2 py-0.5 rounded-fm-chip ${
                document.scope === 'global' ? 'bg-fm-success-bg text-fm-success' :
                document.scope === 'team' ? 'bg-fm-accent/10 text-fm-accent' :
                'bg-fm-surface-alt text-fm-text-secondary'
              }`}>
                {document.scope}
              </span>
            )}
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
          onClick={(e) => { e.stopPropagation(); onDelete(document.document_id); }}
          className="px-3 py-1 text-sm rounded-fm-btn text-fm-warning hover:bg-fm-warning/10 transition-colors flex-shrink-0"
        >
          {actionLabel}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-fm-border px-6 py-4">
          {loadingContent ? (
            <p className="text-sm text-fm-text-tertiary">Loading content...</p>
          ) : content ? (
            <div className="prose prose-sm prose-invert max-w-none max-h-[32rem] overflow-y-auto
              prose-headings:text-fm-text-primary prose-headings:font-semibold
              prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
              prose-p:text-fm-text-secondary prose-p:leading-relaxed
              prose-li:text-fm-text-secondary
              prose-strong:text-fm-text-primary
              prose-code:text-fm-accent prose-code:bg-fm-surface-alt prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
              prose-pre:bg-fm-surface-alt prose-pre:border prose-pre:border-fm-border prose-pre:rounded-fm-input
              prose-a:text-fm-accent prose-a:no-underline hover:prose-a:underline
              prose-table:text-sm prose-th:text-fm-text-primary prose-td:text-fm-text-secondary
              prose-hr:border-fm-border"
            >
              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {content}
              </Markdown>
            </div>
          ) : (
            <p className="text-sm text-fm-text-tertiary">No content available.</p>
          )}
        </div>
      )}
    </div>
  );
}
