import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { getDocument, updateDocument } from '../lib/knowledge/kb';
import { prepareMarkdown } from '../lib/markdownUtils';
import { PreWithMermaid } from './MermaidDiagram';

export interface DocumentCardData {
  document_id: string;
  title: string;
  document_type: string;
  /**
   * OPTIONAL because the LIST endpoint may omit it, not merely because the
   * schema marks it so.
   *
   * `tags` is a Pydantic field with `default_factory=list`, which FastAPI marks
   * not-required, so `openapi-typescript` renders it `tags?: string[]` on
   * `KnowledgeBaseDocument`. Widening this prop to match is what lets a
   * contract-derived row be passed here directly (faultmaven-dashboard#165).
   *
   * ⚠️ Do NOT generalise this into "fields with defaults render optional" —
   * that rule is false and was stated wrongly here once. `verification_level`
   * and `verification_status` also have defaults and are REQUIRED in the
   * generated type, because a default with a non-`Optional` annotation still
   * lands in the schema's `required`. Which fields a given ROUTE omits is a
   * separate question from which the schema marks optional, and only the first
   * one matters at a call site.
   */
  tags?: string[];
  scope?: string;
  /**
   * Who owns the document. Carried by BOTH the list rows and the single-document
   * response, and read by `KBPage.canModifyDocument` to decide the Edit control.
   * It has to be declared here because `DocumentList.canEditFn` receives a
   * `DocumentCardData` — a gate cannot read a field its parameter type hides.
   */
  owner_id?: string | null;
  created_at: string;
  content?: string;
}

interface DocumentCardProps {
  document: DocumentCardData;
  onDelete: (id: string) => void;
  onUpdated?: () => void;
  canEdit?: boolean;
  canRemove?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function DocumentCard({ document, onDelete, onUpdated, canEdit = true, canRemove = true, isExpanded, onToggleExpand }: DocumentCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = isExpanded ?? internalExpanded;
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState<string | null>(document.content || null);
  /**
   * The "Saved" badge's own timer, held so unmount can clear it.
   *
   * Without this the 2s callback fires on a card that may be gone — harmless in
   * React 19, but it is also the kind of stray timer that keeps a closure (and
   * this component's whole scope) alive until it runs.
   */
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    },
    [],
  );
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
      if (onToggleExpand) onToggleExpand();
      else setInternalExpanded(false);
      return;
    }
    await loadContent();
    if (onToggleExpand) onToggleExpand();
    else setInternalExpanded(true);
  };

  const handleStartEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const loaded = content || (await loadContent());
    if (loaded) {
      setEditContent(loaded);
      setEditing(true);
      if (!expanded) {
        if (onToggleExpand) onToggleExpand();
        else setInternalExpanded(true);
      }
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
    let saved = false;
    try {
      await updateDocument(document.document_id, { content: editContent });
      setContent(editContent);
      setEditing(false);
      setSaveSuccess(true);
      // Cleared on unmount — see `successTimer`.
      successTimer.current = setTimeout(() => setSaveSuccess(false), 2000);
      saved = true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }

    // OUTSIDE the try, so the `catch` keeps meaning "the write failed".
    // A callback that threw from inside it would be caught by the save's own
    // handler and recorded as a failed save, after the PUT had already
    // succeeded.
    //
    // ⚠️ DEFENSIVE, not a fix for anything observable today, and deliberately
    // untested for that reason: `setEditing(false)` has already run and
    // `saveError` renders only in the editing branch, so the mis-set error is
    // invisible and `saveSuccess` stays true either way. A test here passes
    // against both arrangements — it was written, found vacuous, and removed
    // rather than left as decoration. `onUpdated` is `() => loadPage(page)`,
    // which has its own try/catch, so no caller throws today.
    //
    // Tell the owner of the list that the server copy moved. Without this the
    // save updated only THIS card's local `content`, so the row the parent
    // holds kept its pre-edit body and everything derived from the list — the
    // title/tag search in `useKBList`, the domain/service/severity facets built
    // from `metadata` — stayed stale until navigation. The prop was declared,
    // forwarded by `DocumentList` and passed by `KBPage` as
    // `() => loadPage(page)`; it was simply never destructured, which
    // `noUnusedParameters` cannot flag because the name never appears.
    //
    // Only on success: a refetch after a failed save would replace the text the
    // user is still trying to save with the server copy they were changing.
    if (saved) onUpdated?.();
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
        className="flex items-center justify-between px-4 py-2 cursor-pointer"
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggle(); }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <svg
              className={`w-3 h-3 text-fm-text-tertiary flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
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
            <span className="text-xs px-1.5 py-px rounded-fm-chip bg-fm-accent-soft text-fm-accent">
              {document.document_type.replace('_', ' ')}
            </span>
            {document.scope && (
              <span className={`text-xs px-1.5 py-px rounded-fm-chip ${
                document.scope === 'global' ? 'bg-fm-success-bg text-fm-success' :
                document.scope === 'team' ? 'bg-fm-accent/10 text-fm-accent' :
                'bg-fm-surface-alt text-fm-text-secondary'
              }`}>
                {document.scope}
              </span>
            )}
            {(document.tags?.length ?? 0) > 0 && (
              <span className="text-xs text-fm-text-tertiary">
                {document.tags?.join(', ')}
              </span>
            )}
            <span className="text-xs text-fm-text-tertiary">
              {new Date(document.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canEdit && (
            <button
              onClick={handleStartEdit}
              className="px-2.5 py-1 text-xs rounded-fm-btn text-fm-accent hover:bg-fm-accent/10 transition-colors"
            >
              Edit
            </button>
          )}
          {canRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(document.document_id); }}
              className="px-2.5 py-1 text-xs rounded-fm-btn text-fm-critical/70 hover:text-fm-critical hover:bg-fm-critical/10 transition-colors"
            >
              Remove
            </button>
          )}
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
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                  // Runbooks are the likeliest KB content to carry mermaid;
                  // keep the KB viewer's rendering in step with the case tabs.
                  pre: PreWithMermaid,
                }}
              >
                {prepareMarkdown(content, { frontmatter: true })}
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
