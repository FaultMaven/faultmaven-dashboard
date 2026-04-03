import { useCallback, useEffect, useState } from 'react';
import { listCases, searchCases, archiveCase } from '../lib/api';
import type { CaseSummary, CaseFilters } from '../types/cases';

export interface UseCaseListResult {
  cases: CaseSummary[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
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

  const loadPage = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(null);
      try {
        if (filters.search) {
          const results = await searchCases(filters.search, nextPage, pageSize);
          setCases(results);
          setTotalCount(results.length);
          setPage(nextPage);
        } else {
          const response = await listCases(filters, nextPage, pageSize);
          setCases(response.cases);
          setTotalCount(response.total_count);
          setPage(nextPage);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load cases');
      } finally {
        setLoading(false);
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

  return {
    cases,
    totalCount,
    loading,
    error,
    page,
    pageSize,
    filters,
    setFilters,
    loadPage,
    archiveById,
  };
}
