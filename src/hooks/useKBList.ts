import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listDocuments as listUserDocuments,
  listAdminDocuments,
  deleteDocument as deleteUserDocument,
  deleteAdminDocument,
  KBDocument,
  AdminKBDocument,
  ScopeCounts,
} from '../lib/api';

export type KBScope = 'user' | 'admin';
export type KnowledgeScope = 'all' | 'global' | 'team' | 'personal';

export interface UseKBListResult<T extends KBDocument | AdminKBDocument> {
  documents: T[];
  filteredDocuments: T[];
  totalCount: number;
  scopeCounts: ScopeCounts;
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  search: string;
  scopeFilter: KnowledgeScope;
  setSearch: (value: string) => void;
  setScopeFilter: (value: KnowledgeScope) => void;
  loadPage: (page: number) => Promise<void>;
  deleteById: (id: string) => Promise<void>;
}

export function useKBList(scope: KBScope, pageSize = 20): UseKBListResult<KBDocument | AdminKBDocument> {
  const [documents, setDocuments] = useState<(KBDocument | AdminKBDocument)[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [scopeCounts, setScopeCounts] = useState<ScopeCounts>({ global: 0, team: 0, personal: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<KnowledgeScope>('all');

  // Monotonic request id: only the latest in-flight load may apply its result,
  // so out-of-order responses from rapid scope/page changes can't clobber
  // newer state. Mirrors the cancelled-flag pattern in AdminCaseListPage.
  const reqIdRef = useRef(0);
  // Guard against setState after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPage = useCallback(
    async (nextPage: number) => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const params: { limit: number; offset: number; scope?: string } = {
          limit: pageSize,
          offset: nextPage * pageSize,
        };
        if (scopeFilter !== 'all') {
          params.scope = scopeFilter;
        }

        let response;
        if (scope === 'admin') {
          response = await listAdminDocuments(params);
        } else {
          response = await listUserDocuments(params);
        }
        if (reqId !== reqIdRef.current || !mountedRef.current) return; // superseded
        // The page came back empty on a non-first page — it was emptied out
        // from under us (e.g. deleting its last row(s), single or batch). Fall
        // back to the previous page rather than stranding the user on a blank
        // list with a live "Prev". The recursion re-checks and unwinds to a
        // populated page (or page 0). Reading emptiness off the fresh response
        // (not stale `documents`) makes this correct under batch deletes too.
        if (response.documents.length === 0 && nextPage > 0) {
          return loadPage(nextPage - 1);
        }
        setDocuments(response.documents);
        setTotalCount(response.total_count);
        if (response.scope_counts) {
          setScopeCounts(response.scope_counts);
        }
        setPage(nextPage);
      } catch (err) {
        // Without a catch the rejection was unhandled and the list silently
        // stayed empty; surface it so the page can render an error state.
        if (reqId !== reqIdRef.current || !mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load documents');
      } finally {
        // Only the latest request may clear the spinner: a superseded request
        // settling first must not flip loading off while a newer one is pending.
        if (reqId === reqIdRef.current && mountedRef.current) setLoading(false);
      }
    },
    [scope, scopeFilter, pageSize]
  );

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  const deleteById = useCallback(
    async (id: string) => {
      if (scope === 'admin') {
        await deleteAdminDocument(id);
      } else {
        await deleteUserDocument(id);
      }
      // Reload the current page; loadPage falls back to the previous page if
      // this one is now empty (last row removed), so no stale-`page` math is
      // needed here and it stays correct under batch deletes.
      await loadPage(page);
    },
    [scope, loadPage, page]
  );

  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter((doc) => {
      const tags = Array.isArray(doc.tags) ? doc.tags.join(',') : '';
      return doc.title.toLowerCase().includes(term) || tags.toLowerCase().includes(term);
    });
  }, [documents, search]);

  return {
    documents,
    filteredDocuments,
    totalCount,
    scopeCounts,
    loading,
    error,
    page,
    pageSize,
    search,
    scopeFilter,
    setSearch,
    setScopeFilter,
    loadPage,
    deleteById,
  };
}
