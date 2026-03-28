import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { getDocument, updateDocument } from '../lib/knowledge/kb';

/** Strip YAML frontmatter (---...---) from markdown content before rendering. */
function stripFrontmatter(md: string): string {
  return md.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
}

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
  onUpdated?: () => void;
}

export function DocumentCard({ document, onDelete }: DocumentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState<string | null>(document.content || null);
  const [editContent, setEditContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadContent = async (): Promise<string | null> => {
    if (content) return content;
    setLoadingContent(true);
    try {
      const doc = await getDocument(document.document_id);
      setContent(doc.content);
      return doc.content;
    } catch {
      setContent('[Failed to load content]');
      return null;
    } finally {
      setLoadingContent(false);
    }
  };

  const handleToggle = async () => {
    if (editing) return;
    if (expanded) {
      setExpanded(false);
      return;
    }
    await loadContent();
    setExpanded(true);
  };

  const handleStartEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const loaded = content || (await loadContent());
    if (loaded) {
      setEditContent(loaded);
      setEditing(true);
      setExpanded(true);
      setSaveError(null);
      setSaveSuccess(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateDocument(document.document_id, { content: editContent });
      setContent(editContent);
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const dirty = editing && editContent !== content;

  const proseClasses = `prose prose-sm prose-invert max-w-none max-h-[32rem] overflow-y-auto
    prose-headings:text-fm-text-primary prose-headings:font-semibold
    prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
    prose-p:text-fm-text-secondary prose-p:leading-relaxed
    prose-li:text-fm-text-secondary
    prose-strong:text-fm-text-primary
    prose-code:text-fm-text-primary prose-code:bg-fm-elevated prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal
    prose-pre:bg-fm-surface-alt prose-pre:border prose-pre:border-fm-border prose-pre:rounded-fm-input
    prose-a:text-fm-accent prose-a:no-underline hover:prose-a:underline
    prose-table:text-sm prose-th:text-fm-text-primary prose-td:text-fm-text-secondary
    prose-hr:border-fm-border`;

  return (
    <div className="border border-fm-border rounded-fm-card hover:bg-fm-elevated transition-colors">
      {/* Header row */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggle(); }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <svg
              className={`w-3.5 h-3.5 text-fm-text-tertiary flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <h4 className="text-sm font-medium text-fm-text-primary truncate">{document.title}</h4>
            {saveSuccess && (
              <span className="text-xs text-fm-success">Saved</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 ml-5">
            <span className="text-[11px] px-1.5 py-px rounded-fm-chip bg-fm-accent-soft text-fm-accent">
              {document.document_type.replace('_', ' ')}
            </span>
            {document.scope && (
              <span className={`text-[11px] px-1.5 py-px rounded-fm-chip ${
                document.scope === 'global' ? 'bg-fm-success-bg text-fm-success' :
                document.scope === 'team' ? 'bg-fm-accent/10 text-fm-accent' :
                'bg-fm-surface-alt text-fm-text-secondary'
              }`}>
                {document.scope}
              </span>
            )}
            {document.tags.length > 0 && (
              <span className="text-[11px] text-fm-text-tertiary">
                {document.tags.join(', ')}
              </span>
            )}
            <span className="text-[11px] text-fm-text-tertiary">
              {new Date(document.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleStartEdit}
            className="px-2.5 py-1 text-xs rounded-fm-btn text-fm-accent hover:bg-fm-accent/10 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(document.document_id); }}
            className="px-2.5 py-1 text-xs rounded-fm-btn text-fm-critical/70 hover:text-fm-critical hover:bg-fm-critical/10 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Content area */}
      {expanded && (
        <div className="border-t border-fm-border px-5 py-3">
          {loadingContent ? (
            <p className="text-sm text-fm-text-tertiary">Loading...</p>

          ) : editing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[20rem] px-3 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-xs text-fm-text-primary font-mono placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent resize-y"
                placeholder="Runbook markdown content..."
              />
              {saveError && (
                <p className="text-xs text-fm-critical">{saveError}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-fm-accent rounded-fm-btn hover:brightness-110 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium text-fm-text-secondary border border-fm-border rounded-fm-btn hover:bg-fm-elevated transition-colors"
                >
                  Cancel
                </button>
                {dirty && (
                  <span className="text-[11px] text-fm-text-tertiary">Unsaved changes</span>
                )}
              </div>
            </div>

          ) : content ? (
            <div className={proseClasses}>
              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {stripFrontmatter(content)}
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
