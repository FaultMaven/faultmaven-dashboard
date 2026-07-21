import { useCallback, useEffect, useRef, useState } from 'react';
import { listCases, searchCases, archiveCase } from '../lib/api';
import type { CaseSummary, CaseFilters } from '../types/cases';

/**
 * Backend `POST /cases/search` accepts only a `limit` (max 100) — no offset.
 * We pull up to this many matches in one shot and show them as a single page.
 */
const SEARCH_LIMIT = 100;

export interface UseCaseListResult {
  cases: CaseSummary[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  /** True while the list reflects a free-text search (single, un-paginated page). */
  searchMode: boolean;
  filters: CaseFilters;
  setFilters: (filters: CaseFilters) => void;
  loadPage: (page: number) => Promise<void>;
  archiveById: (caseId: string, reason?: string) => Promise<void>;
}

export function useCaseList(pageSize = 20): UseCaseListResult {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filters, setFiltersState] = useState<CaseFilters>({});
  const [searchMode, setSearchMode] = useState(false);

  // Monotonic request id: only the latest in-flight load may apply its result,
  // so out-of-order responses from rapid filter/page changes can't clobber
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
        if (filters.search) {
          const results = await searchCases(filters.search, SEARCH_LIMIT);
          if (reqId !== reqIdRef.current || !mountedRef.current) return;
          setCases(results);
          // Not the grand total — just the count of matches we can show. The
          // pager collapses to one page in search mode (see effectivePageSize).
          setTotalCount(results.length);
          setSearchMode(true);
          setPage(0);
        } else {
          const response = await listCases(filters, nextPage, pageSize);
          if (reqId !== reqIdRef.current || !mountedRef.current) return;
          setCases(response.cases);
          setTotalCount(response.total_count);
          setSearchMode(false);
          setPage(nextPage);
        }
      } catch (err) {
        if (reqId !== reqIdRef.current || !mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load cases');
      } finally {
        // Only the latest request may clear the spinner: a superseded request
        // settling first must not flip loading off while a newer one is pending.
        if (reqId === reqIdRef.current && mountedRef.current) setLoading(false);
      }
    },
    [filters, pageSize]
  );

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  const setFilters = useCallback((newFilters: CaseFilters) => {
    setFiltersState(newFilters);
    // loadPage will be called by the effect when filters change
  }, []);

  const archiveById = useCallback(
    async (caseId: string, _reason?: string) => {
      await archiveCase(caseId);
      await loadPage(page);
    },
    [loadPage, page]
  );

  // In search mode the backend returns every match in one page, so collapse the
  // pager to a single page (Prev/Next disabled) instead of faking pages that
  // would silently hide matches beyond the first slice.
  const effectivePageSize = searchMode ? Math.max(cases.length, 1) : pageSize;

  return {
    cases,
    totalCount,
    loading,
    error,
    page,
    pageSize: effectivePageSize,
    searchMode,
    filters,
    setFilters,
    loadPage,
    archiveById,
  };
}
