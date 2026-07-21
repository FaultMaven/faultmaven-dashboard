import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useKBList } from '../../hooks/useKBList';

vi.mock('../../lib/api', () => ({
  listDocuments: vi.fn(),
  listAdminDocuments: vi.fn(),
  deleteDocument: vi.fn(),
  deleteAdminDocument: vi.fn(),
}));

import { listDocuments, deleteDocument } from '../../lib/api';

const mockList = listDocuments as ReturnType<typeof vi.fn>;
const mockDelete = deleteDocument as ReturnType<typeof vi.fn>;

const doc = (id: string) => ({
  document_id: id,
  title: `Doc ${id}`,
  scope: 'personal',
  tags: [],
});

const listResponse = (documents: ReturnType<typeof doc>[], total_count: number) => ({
  documents,
  total_count,
  scope_counts: { global: 0, team: 0, personal: total_count },
});

describe('useKBList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue(listResponse([doc('a')], 1));
  });

  it('surfaces an error when the list request fails (no silent empty list)', async () => {
    mockList.mockRejectedValueOnce(new Error('Backend down'));

    const { result } = renderHook(() => useKBList('user'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Backend down');
    expect(result.current.documents).toHaveLength(0);
  });

  it('clears the error on a subsequent successful load', async () => {
    mockList.mockRejectedValueOnce(new Error('Backend down'));

    const { result } = renderHook(() => useKBList('user'));
    await waitFor(() => expect(result.current.error).toBe('Backend down'));

    mockList.mockResolvedValueOnce(listResponse([doc('a')], 1));
    await act(async () => { await result.current.loadPage(0); });

    expect(result.current.error).toBeNull();
    expect(result.current.documents).toHaveLength(1);
  });

  it('steps back a page when the last row of the last page is deleted', async () => {
    // Page 0 full (20 rows, 21 total), page 1 has the single trailing row.
    mockList.mockResolvedValueOnce(
      listResponse(Array.from({ length: 20 }, (_, i) => doc(`p0-${i}`)), 21),
    );
    const { result } = renderHook(() => useKBList('user'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockList.mockResolvedValueOnce(listResponse([doc('last')], 21));
    await act(async () => { await result.current.loadPage(1); });
    expect(result.current.page).toBe(1);

    mockDelete.mockResolvedValueOnce(undefined);
    // Reloading page 1 (offset 20) now comes back empty (21 → 20 rows), which
    // triggers the fallback to page 0 (offset 0).
    mockList
      .mockResolvedValueOnce(listResponse([], 20))
      .mockResolvedValueOnce(listResponse(Array.from({ length: 20 }, (_, i) => doc(`p0-${i}`)), 20));
    await act(async () => { await result.current.deleteById('last'); });

    expect(mockDelete).toHaveBeenCalledWith('last');
    // Fell back to page 0 (offset 0) rather than stranding on the empty page 1.
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));
    await waitFor(() => expect(result.current.page).toBe(0));
    expect(result.current.documents).toHaveLength(20);
  });

  it('stays on the page when a non-last row is deleted', async () => {
    mockList.mockResolvedValueOnce(listResponse([doc('a'), doc('b')], 2));
    const { result } = renderHook(() => useKBList('user'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockDelete.mockResolvedValueOnce(undefined);
    mockList.mockResolvedValueOnce(listResponse([doc('b')], 1));
    await act(async () => { await result.current.deleteById('a'); });

    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));
    expect(result.current.page).toBe(0);
  });
});
