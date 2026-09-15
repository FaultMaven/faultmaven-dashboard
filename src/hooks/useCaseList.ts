import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { listCases, searchCases } from '../lib/api';
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
  /**
   * The filters PENDING in the bar — what the next request will carry.
   *
   * Right for controls the user is operating; WRONG for describing the rows on
   * screen, which is what `appliedFilters` is for.
   */
  filters: CaseFilters;
  /**
   * The filters the rows in `cases` were actually fetched with — a property of
   * the LAST RESPONSE, exactly like `searchMode` (which is now derived from
   * it, rather than being a second copy that can disagree).
   *
   * Anything DESCRIBING the list must read this, never `filters`. The two come
   * apart whenever a request fails, and the rows stay on screen either way:
   *
   * - An inverted range (`from` after `to`) is a 422. `error` is set, `cases`
   *   still holds the previous unfiltered page, and the page renders those
   *   rows — so a description drawn from `filters` would head them `Created`
   *   over a result set no creation-date bound ever touched.
   * - A rejected search leaves `filters.search` set while the rows on screen
   *   are still the date-filtered ones, which is the same error mirrored.
   *
   * It lags by design: on failure it keeps describing the rows that are still
   * displayed rather than the request that did not land.
   */
  appliedFilters: CaseFilters;
  /**
   * Accepts an updater as well as a value, exactly like React's own setter.
   *
   * `CaseFiltersBar`'s debounced search needs to compose against whatever the
   * filters are WHEN IT FIRES, not when it was created. Closing over `filters`
   * made a new debounced function on every filter change and the cleanup then
   * cancelled the pending one, so picking a date within 300ms of typing threw
   * the queued search away. A ref would fix the staleness but reads of
   * `ref.current` during render are (rightly) refused by lint. The functional
   * form has neither problem and is the shape React already uses.
   */
  setFilters: Dispatch<SetStateAction<CaseFilters>>;
  loadPage: (page: number) => Promise<void>;
}

export function useCaseList(pageSize = 20): UseCaseListResult {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  /**
   * True from the FIRST render, not from the first fetch.
   *
   * The hook always loads on mount, so `false` here was a lie for one render —
   * and a consumer that reads `!loading && cases.length === 0` as "this person
   * has no cases" saw exactly that on every mount, before a single request had
   * been made. CaseListPage now redirects such a person to the panel
   * (ADR-016 D6), which turned that one render into an immediate bounce off a
   * list that was about to arrive.
   */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filters, setFiltersState] = useState<CaseFilters>({});
  /**
   * What the rows in `cases` were fetched with. `{}` to begin with, which is
   * the truth: `cases` starts empty and nothing has been applied to it.
   *
   * Updated ONLY on success, beside `setCases`, so it always describes the
   * rows actually on screen — see the interface docstring for the two ways
   * `filters` and this come apart.
   */
  const [appliedFilters, setAppliedFilters] = useState<CaseFilters>({});

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
      // The filters THIS request carries, pinned before the first await so a
      // later edit cannot be mistaken for what was sent.
      const sent = filters;
      setLoading(true);
      setError(null);
      try {
        if (sent.search) {
          const results = await searchCases(sent.search, SEARCH_LIMIT, sent.team_id);
          if (reqId !== reqIdRef.current || !mountedRef.current) return;
          setCases(results);
          // Not the grand total — just the count of matches we can show. The
          // pager collapses to one page in search mode (see effectivePageSize).
          setTotalCount(results.length);
          setAppliedFilters(sent);
          setPage(0);
        } else {
          const response = await listCases(sent, nextPage, pageSize);
          if (reqId !== reqIdRef.current || !mountedRef.current) return;
          setCases(response.cases);
          setTotalCount(response.total_count);
          setAppliedFilters(sent);
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

  // Straight through: `setFiltersState` already accepts both shapes, and
  // `loadPage` re-runs from the effect when `filters` changes.
  const setFilters = setFiltersState;

  /**
   * DERIVED from the applied filters, not tracked separately.
   *
   * It was a `useState` set to `true` in the search branch and `false` in the
   * list branch — a second copy of something `appliedFilters` already says, and
   * two states that must agree is the defect this list has now been bitten by
   * twice. It is the same value in every reachable state: both were written
   * only on success, neither on failure, and both start out falsy.
   */
  const searchMode = Boolean(appliedFilters.search);

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
    appliedFilters,
    setFilters,
    loadPage,
  };
}
