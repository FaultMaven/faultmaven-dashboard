import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CaseSummary } from '../../types/cases';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCaseList } from '../../hooks/useCaseList';

vi.mock('../../lib/api', () => ({
  listCases: vi.fn(),
  searchCases: vi.fn(),
}));

import { listCases, searchCases } from '../../lib/api';

const mockListCases = listCases as ReturnType<typeof vi.fn>;
const mockSearchCases = searchCases as ReturnType<typeof vi.fn>;

const mockCase: CaseSummary = {
  case_id: 'c1',
  title: 'Test Case',
  description: 'desc',
  state: 'investigating' as const,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  last_activity_at: '2024-01-01T00:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'u1',
  enterprise_id: 'ent-1',
  current_turn: 3,
  source: 'copilot',
  stage: 'diagnosis',
  turns_without_progress: 0,
  is_terminal: false,
};

describe('useCaseList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCases.mockResolvedValue({
      cases: [mockCase],
      total_count: 1,
      page: 0,
      page_size: 20,
      has_more: false,
    });
  });

  it('fetches cases on mount', async () => {
    const { result } = renderHook(() => useCaseList());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockListCases).toHaveBeenCalledWith({}, 0, 20);
    expect(result.current.cases).toHaveLength(1);
    expect(result.current.totalCount).toBe(1);
  });

  it('setFilters resets to page 0', async () => {
    mockListCases
      .mockResolvedValueOnce({ cases: [mockCase], total_count: 1, page: 0, page_size: 20, has_more: true })
      .mockResolvedValueOnce({ cases: [], total_count: 0, page: 0, page_size: 20, has_more: false });

    const { result } = renderHook(() => useCaseList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.setFilters({ state: 'resolved' });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should have called with new filters and page 0
    expect(mockListCases).toHaveBeenLastCalledWith({ state: 'resolved' }, 0, 20);
  });

  it('sets error state on fetch failure', async () => {
    mockListCases.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useCaseList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Network error');
    expect(result.current.cases).toHaveLength(0);
  });

  it('loadPage navigates to specified page', async () => {
    const page1Response = {
      cases: [{ ...mockCase, case_id: 'c2' }],
      total_count: 2,
      page: 1,
      page_size: 20,
      has_more: false,
    };
    mockListCases.mockResolvedValueOnce({ cases: [mockCase], total_count: 2, page: 0, page_size: 20, has_more: true });
    mockListCases.mockResolvedValueOnce(page1Response);

    const { result } = renderHook(() => useCaseList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.loadPage(1);
    });

    await waitFor(() => expect(result.current.page).toBe(1));
    expect(mockListCases).toHaveBeenLastCalledWith({}, 1, 20);
  });

  it('search mode calls searchCases with a limit and does not fake pages', async () => {
    // 60 matches returned in one request; the backend has no search pagination,
    // so the pager must collapse to a single page (no hidden pages 2..N).
    const results = Array.from({ length: 60 }, (_, i) => ({ ...mockCase, case_id: `s${i}` }));
    mockSearchCases.mockResolvedValueOnce(results);

    const { result } = renderHook(() => useCaseList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.setFilters({ search: 'db outage' });
    });
    await waitFor(() => expect(result.current.searchMode).toBe(true));

    // Query + limit + the narrowing options, which are empty here because no
    // chip or team is set. Still NO date bounds: `CaseSearchRequest` declares
    // none, so there is nothing to send (unlike `state` — see below).
    expect(mockSearchCases).toHaveBeenCalledWith('db outage', 100, {
      teamId: undefined,
      state: undefined,
    });
    expect(result.current.cases).toHaveLength(60);
    // pageSize collapses to the result count => exactly one page in the pager.
    expect(Math.ceil(result.current.totalCount / result.current.pageSize)).toBe(1);
  });

  it('sends the state alongside the query, so the two compose (#166)', async () => {
    // The exact inverse of what this test asserted until #166, and worth
    // keeping the history: `CaseSearchRequest` DECLARED `state` for a long
    // time before the service read it, so sending it typechecked, was
    // accepted, and then nothing applied it — #51 one layer down. This hook
    // withheld the field for that reason. Contract 3.9.0 made it real, so
    // withholding it is now the bug: the chip is lit and narrows nothing.
    mockSearchCases.mockResolvedValue([]);
    const { result } = renderHook(() => useCaseList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.setFilters({ search: 'db outage', state: 'resolved' });
    });
    await waitFor(() => expect(result.current.searchMode).toBe(true));

    expect(mockSearchCases).toHaveBeenLastCalledWith('db outage', 100, {
      teamId: undefined,
      state: 'resolved',
    });
  });

  it('still withholds the DATE bounds on a search, which have no field at all', async () => {
    // The asymmetry #166 introduces, and the thing most likely to be "tidied"
    // into symmetry by someone reading the state change above. `state` now
    // travels because the contract has somewhere to put it; the dates do not,
    // so sending them would be the accepted-and-dropped defect the state
    // chips just stopped having.
    mockSearchCases.mockResolvedValue([]);
    const { result } = renderHook(() => useCaseList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.setFilters({
        search: 'db outage',
        date_from: '2026-09-10',
        date_to: '2026-09-12',
      });
    });
    await waitFor(() => expect(result.current.searchMode).toBe(true));

    const [, , options] = mockSearchCases.mock.lastCall as [string, number, object];
    expect(options).not.toHaveProperty('date_from');
    expect(options).not.toHaveProperty('dateFrom');
    expect(JSON.stringify(mockSearchCases.mock.calls)).not.toContain('2026-09-10');
  });

  it('ignores a superseded (out-of-order) response', async () => {
    // First load (page 0) resolves LAST; a newer load (page 1) resolves first.
    // The stale page-0 result must not overwrite the newer page-1 state.
    let resolveFirst: (v: unknown) => void = () => {};
    const firstResponse = new Promise((res) => {
      resolveFirst = res;
    });
    mockListCases.mockReturnValueOnce(firstResponse); // initial mount load(0)
    mockListCases.mockResolvedValueOnce({
      cases: [{ ...mockCase, case_id: 'newer' }],
      total_count: 5,
      page: 1,
      page_size: 20,
      has_more: false,
    });

    const { result } = renderHook(() => useCaseList());

    // Kick off the newer load before the first resolves.
    await act(async () => {
      await result.current.loadPage(1);
    });
    expect(result.current.cases[0].case_id).toBe('newer');
    expect(result.current.loading).toBe(false);

    // Now let the stale initial load settle — it must be ignored.
    await act(async () => {
      resolveFirst({
        cases: [{ ...mockCase, case_id: 'stale' }],
        total_count: 1,
        page: 0,
        page_size: 20,
        has_more: false,
      });
      await firstResponse;
    });

    expect(result.current.cases[0].case_id).toBe('newer');
    expect(result.current.page).toBe(1);
  });
});

/**
 * `appliedFilters` — the filters the rows in hand were actually fetched with
 * (faultmaven-dashboard#155).
 *
 * `filters` is what the bar is about to send; `appliedFilters` is what the last
 * response was built from. Anything DESCRIBING the list has to read the second,
 * and the two come apart exactly when a request fails and the previous rows
 * stay on screen.
 */
describe('useCaseList — appliedFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCases.mockResolvedValue({
      cases: [mockCase],
      total_count: 1,
      page: 0,
      page_size: 20,
      has_more: false,
    });
  });

  it('starts empty, which is the truth about an empty list', async () => {
    const { result } = renderHook(() => useCaseList());
    expect(result.current.appliedFilters).toEqual({});
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('records the filters a successful load carried', async () => {
    const { result } = renderHook(() => useCaseList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setFilters({ date_from: '2026-09-01' }));
    await waitFor(() => expect(result.current.appliedFilters).toEqual({ date_from: '2026-09-01' }));
  });

  it('KEEPS the last applied filters when a load fails, because the rows do too', async () => {
    const { result } = renderHook(() => useCaseList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cases).toHaveLength(1);

    mockListCases.mockRejectedValue(new Error('created_after must be before created_before'));
    act(() => result.current.setFilters({ date_from: '2026-09-20', date_to: '2026-09-01' }));

    await waitFor(() => expect(result.current.error).toBeTruthy());
    // The rows are the previous, unfiltered ones…
    expect(result.current.cases).toHaveLength(1);
    // …so what describes them must be too. `filters` has already moved on.
    expect(result.current.appliedFilters).toEqual({});
    expect(result.current.filters).toEqual({ date_from: '2026-09-20', date_to: '2026-09-01' });
  });

  it('derives searchMode from it, so the two cannot disagree', async () => {
    const { result } = renderHook(() => useCaseList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.searchMode).toBe(Boolean(result.current.appliedFilters.search));

    mockSearchCases.mockResolvedValue([mockCase]);
    act(() => result.current.setFilters({ search: 'payment' }));

    await waitFor(() => expect(result.current.searchMode).toBe(true));
    expect(result.current.appliedFilters).toEqual({ search: 'payment' });
    expect(result.current.searchMode).toBe(Boolean(result.current.appliedFilters.search));
  });
});
