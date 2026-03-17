import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCaseList } from '../../hooks/useCaseList';

vi.mock('../../lib/api', () => ({
  listCases: vi.fn(),
  archiveCase: vi.fn().mockResolvedValue(undefined),
}));

import { listCases, archiveCase } from '../../lib/api';

const mockListCases = listCases as ReturnType<typeof vi.fn>;
const mockArchiveCase = archiveCase as ReturnType<typeof vi.fn>;

const mockCase = {
  case_id: 'c1',
  title: 'Test Case',
  description: 'desc',
  status: 'investigating' as const,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  last_activity_at: '2024-01-01T00:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'u1',
  organization_id: 'org1',
  current_turn: 3,
  milestones_completed: 2,
  total_milestones: 5,
  is_stuck: false,
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
      result.current.setFilters({ status: 'resolved' });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should have called with new filters and page 0
    expect(mockListCases).toHaveBeenLastCalledWith({ status: 'resolved' }, 0, 20);
  });

  it('archiveById calls archiveCase and reloads', async () => {
    const { result } = renderHook(() => useCaseList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.archiveById('c1');
    });

    expect(mockArchiveCase).toHaveBeenCalledWith('c1', 'archived');
    expect(mockListCases).toHaveBeenCalledTimes(2); // initial + reload
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
});
