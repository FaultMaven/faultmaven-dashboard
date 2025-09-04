import React, { useState, useEffect } from 'react';
import { UserCase, getUserCases, deleteCase as deleteCaseApi, generateCaseTitle, updateCaseTitle as apiUpdateCaseTitle } from '../../../lib/api';
import { ConversationItem } from './ConversationItem';
import LoadingSpinner from './LoadingSpinner';

interface ConversationsListProps {
  activeSessionId?: string; // kept for compatibility
  activeCaseId?: string;
  onCaseSelect?: (caseId: string) => void;
  onSessionSelect?: (sessionId: string) => void; // kept for compatibility
  onNewSession: (sessionId: string) => void;
  conversationTitles?: Record<string, string>;
  hasUnsavedNewChat?: boolean;
  refreshTrigger?: number;
  className?: string;
  collapsed?: boolean;
  onFirstCaseDetected?: () => void;
  onAfterDelete?: (deletedCaseId: string, remaining: Array<{ case_id: string; updated_at?: string; created_at?: string }>) => void;
  pendingCases?: UserCase[];
}

export function ConversationsList({ 
  activeSessionId, 
  activeCaseId,
  onCaseSelect,
  onSessionSelect,
  onNewSession,
  conversationTitles = {},
  hasUnsavedNewChat = false,
  refreshTrigger = 0,
  className = '',
  collapsed = false,
  onFirstCaseDetected,
  onAfterDelete,
  pendingCases = []
}: ConversationsListProps) {
  const [cases, setCases] = useState<UserCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caseTitles, setCaseTitles] = useState<Record<string, string>>({});

  useEffect(() => { loadCases(); }, []);
  useEffect(() => { if (refreshTrigger > 0) loadCases(); }, [refreshTrigger]);
  // Helper: merge backend cases with pending overlays at render time to avoid flicker
  const mergeWithPending = (baseCases: UserCase[]): UserCase[] => {
    const base = Array.isArray(baseCases) ? baseCases.filter(c => c && c.case_id) : [];
    const mergedMap = new Map<string, UserCase>();
    base.forEach(c => mergedMap.set(c.case_id, c));
    (pendingCases || []).forEach(pc => { if (pc?.case_id && !mergedMap.has(pc.case_id)) mergedMap.set(pc.case_id, pc); });
    const merged = Array.from(mergedMap.values());
    merged.sort((a,b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
    return merged;
  };

  const loadCases = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await getUserCases({ limit: 100, offset: 0 });
      const base = Array.isArray(list) ? list.filter(c => c && c.case_id) : [];
      const sorted = mergeWithPending(base);
      setCases(sorted);
      console.log('[ConversationsList] Backend cases:', sorted);
    } catch (err) {
      const full = err instanceof Error ? err.message : String(err);
      console.error('[ConversationsList] Failed to load cases:', full);
      setError(`Failed to list chats: ${full}`);
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  const getCaseTitle = (c: UserCase): string => {
    const t = caseTitles[c.case_id] || (conversationTitles && conversationTitles[c.case_id]) || c.title;
    if (t && t.trim()) return t;
    const ts = new Date(c.updated_at || c.created_at || Date.now()).toISOString();
    return `chat-${ts}`;
  };

  const updateCaseTitle = (caseId: string, title: string) => setCaseTitles(prev => ({ ...prev, [caseId]: title }));
  const handleRenameCase = async (caseId: string, newTitle: string) => {
    const title = (newTitle || '').trim();
    if (!title) return;
    try {
      await apiUpdateCaseTitle(caseId, title);
      updateCaseTitle(caseId, title);
      // Pull server truth so other fields (updated_at, etc.) reflect immediately
      await loadCases();
    } catch (e) {
      console.error('[ConversationsList] Rename failed:', e);
    }
  };

  const handleGenerateTitle = async (caseId: string, sessionIdGuess?: string) => {
    try {
      const { title } = await generateCaseTitle(caseId, { max_words: 8 });
      const newTitle = (title || '').trim();
      if (!newTitle) return; // keep current title (likely timestamp)
      await apiUpdateCaseTitle(caseId, newTitle);
      updateCaseTitle(caseId, newTitle);
      await loadCases();
    } catch (e: any) {
      const msg = (e?.message || '').toString().toLowerCase();
      if (msg.includes('insufficient context')) {
        // No-op: keep existing timestamp title as-is; do not overwrite
        console.info('[ConversationsList] Title generation skipped: insufficient context');
        return;
      }
      console.warn('[ConversationsList] Title generation failed:', e);
      // No fallback overwrite; preserve current title
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    try {
      await deleteCaseApi(caseId);
      setCases(prev => {
        const remaining = prev.filter(c => c.case_id !== caseId);
        // Notify parent first
        try { onAfterDelete && onAfterDelete(caseId, remaining); } catch {}
        // If we deleted the active case, auto-switch to most recent remaining; else start new
        try {
          if (activeCaseId && activeCaseId === caseId) {
            const sorted = [...remaining].sort((a,b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
            const next = sorted[0];
            if (next && next.case_id) {
              onCaseSelect && onCaseSelect(next.case_id);
            } else {
              onNewSession && onNewSession('');
            }
          }
        } catch {}
        return remaining;
      });
      // Refresh from server to ensure list reflects backend state
      try { await loadCases(); } catch {}
    } catch (e) {
      console.error('[ConversationsList] Delete failed:', e);
    }
  };

  const groupCasesByTime = (items: UserCase[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const groups = { today: [] as UserCase[], sevenDays: [] as UserCase[], thirtyDays: [] as UserCase[], older: [] as UserCase[] };
    items.filter(c => c && c.case_id).forEach(c => {
      const d = new Date(c.updated_at || c.created_at || 0);
      if (d >= today) groups.today.push(c);
      else if (d >= sevenDaysAgo) groups.sevenDays.push(c);
      else if (d >= thirtyDaysAgo) groups.thirtyDays.push(c);
      else groups.older.push(c);
    });
    return groups;
  };

  const pendingIdSet = new Set<string>((pendingCases || []).map(pc => pc.case_id));

  const renderCaseGroup = (title: string, items: UserCase[]) => {
    if (items.length === 0) return null;
    return (
      <div key={title} className="space-y-1">
        <h3 className="text-xs font-medium text-gray-500 px-3 py-2 uppercase tracking-wider">{title}</h3>
        <div className="space-y-1">
          {items.map((c) => (
            <ConversationItem
              key={c.case_id}
              session={{ session_id: c.case_id, created_at: c.created_at || '', status: 'active', last_activity: c.updated_at || '', metadata: {} } as any}
              title={pendingIdSet.has(c.case_id) ? `${getCaseTitle(c)} (pending)` : getCaseTitle(c)}
              isActive={Boolean(activeCaseId && c.case_id === activeCaseId)}
              isUnsavedNew={false}
              onSelect={(id) => onCaseSelect && onCaseSelect(id)}
              onDelete={(id) => handleDeleteCase(id)}
              onRename={(id, t) => handleRenameCase(id, t)}
              onGenerateTitle={(id) => handleGenerateTitle(id, (c as any).session_id || activeSessionId)}
            />
          ))}
        </div>
      </div>
    );
  };

  const mergedCases = mergeWithPending(cases);

  if (loading && mergedCases.length === 0) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="sm" />
        </div>
      </div>
    );
  }

  const caseGroups = groupCasesByTime(mergedCases);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {error && !error.includes('Failed to fetch') && (
        <div className="flex-shrink-0 p-3 mx-3 mt-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="mt-1 text-xs text-red-600 hover:text-red-800 underline">Dismiss</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {hasUnsavedNewChat && (
          <div className="space-y-1 pb-2">
            <ConversationItem
              key="__new_chat__"
              session={{ session_id: 'new', created_at: new Date().toISOString(), status: 'active', last_activity: new Date().toISOString(), metadata: {} } as any}
              title="New Chat"
              isActive={!activeCaseId}
              isUnsavedNew={true}
              onSelect={() => onNewSession('')}
              onDelete={undefined}
              onRename={undefined}
            />
          </div>
        )}

        {mergedCases.length === 0 && !error?.includes('Failed to fetch') ? (
          <div className="text-center py-8 px-4">
            <p className="text-sm text-gray-500 mb-3">No conversations yet</p>
            <p className="text-xs text-gray-400">Click "New chat" to start your first conversation</p>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {renderCaseGroup('Today', caseGroups.today)}
            {renderCaseGroup('7 Days', caseGroups.sevenDays)}
            {renderCaseGroup('30 Days', caseGroups.thirtyDays)}
            {renderCaseGroup('Older', caseGroups.older)}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversationsList;