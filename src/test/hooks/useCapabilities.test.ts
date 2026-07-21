import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockGetCapabilities = vi.fn();
vi.mock('../../lib/meta', () => ({
  getCapabilities: () => mockGetCapabilities(),
}));

// The hook holds a process-wide store, so reset the module between tests to get
// a fresh unfetched baseline (there is no eviction path — capabilities carry no
// per-user data).
async function loadHook() {
  const { useCapabilities } = await import('../../hooks/useCapabilities');
  return renderHook(() => useCapabilities());
}

describe('useCapabilities', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetCapabilities.mockReset();
  });

  it('reports managementConsole + teamSharing true when the backend advertises them', async () => {
    mockGetCapabilities.mockResolvedValue({
      features: { managementConsole: true, teamSharing: true },
    });

    const { result } = await loadHook();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.managementConsole).toBe(true);
    expect(result.current.teamSharing).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('reads a missing flag as false (older backend / partial response)', async () => {
    mockGetCapabilities.mockResolvedValue({ features: { teamSharing: false } });

    const { result } = await loadHook();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.managementConsole).toBe(false);
    expect(result.current.teamSharing).toBe(false);
  });

  it('reads a missing features object as all-false', async () => {
    mockGetCapabilities.mockResolvedValue({});

    const { result } = await loadHook();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.managementConsole).toBe(false);
  });

  it('degrades to feature-off on fetch error', async () => {
    mockGetCapabilities.mockRejectedValue(new Error('offline'));

    const { result } = await loadHook();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.managementConsole).toBe(false);
    expect(result.current.error).toBe('offline');
  });

  it('retries on a later mount after a first-load error (self-heals)', async () => {
    // First mount: fetch fails → error, feature off.
    mockGetCapabilities.mockRejectedValueOnce(new Error('offline'));
    // Any later fetch succeeds.
    mockGetCapabilities.mockResolvedValue({ features: { managementConsole: true } });

    const { useCapabilities } = await import('../../hooks/useCapabilities');
    const first = renderHook(() => useCapabilities());
    await waitFor(() => expect(first.result.current.error).toBe('offline'));
    expect(first.result.current.managementConsole).toBe(false);
    first.unmount();

    // Remount (e.g. navigation): the errored store refetches — no window focus needed.
    const second = renderHook(() => useCapabilities());
    await waitFor(() => expect(second.result.current.managementConsole).toBe(true));
    expect(mockGetCapabilities).toHaveBeenCalledTimes(2);
  });
});
