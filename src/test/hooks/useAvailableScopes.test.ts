import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Capture the real invalidator that the hook module registers with AuthManager
// at load time, so tests can simulate an auth-cleared (logout / refresh-fail)
// event and assert the process-wide scope cache is evicted. Hoisted so the
// (hoisted) vi.mock factory below can reference it.
const { authClearedListeners } = vi.hoisted(() => ({
  authClearedListeners: [] as Array<() => void>,
}));

vi.mock('../../lib/auth', () => ({
  getAvailableScopes: vi.fn(),
  authManager: {
    onAuthCleared: (cb: () => void) => {
      authClearedListeners.push(cb);
      return () => {
        const i = authClearedListeners.indexOf(cb);
        if (i >= 0) authClearedListeners.splice(i, 1);
      };
    },
  },
}));

import { useAvailableScopes, invalidateAvailableScopes } from '../../hooks/useAvailableScopes';
import { getAvailableScopes } from '../../lib/auth';

const mockGetScopes = getAvailableScopes as ReturnType<typeof vi.fn>;

function triggerAuthCleared() {
  for (const cb of [...authClearedListeners]) cb();
}

describe('useAvailableScopes', () => {
  beforeEach(() => {
    mockGetScopes.mockReset();
    // Reset the process-wide store to its unfetched baseline between tests.
    invalidateAvailableScopes();
  });

  it('fetches and exposes the current user scopes', async () => {
    mockGetScopes.mockResolvedValueOnce(['personal', 'team', 'global']);

    const { result } = renderHook(() => useAvailableScopes());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scopes).toEqual(['personal', 'team', 'global']);
    expect(result.current.error).toBeNull();
  });

  it('evicts the previous identity scopes on auth-clear so the next fetch is fresh', async () => {
    mockGetScopes.mockResolvedValueOnce(['personal', 'team', 'global']); // user A
    mockGetScopes.mockResolvedValue(['personal', 'global']); // user B (any subsequent fetch)

    const { result } = renderHook(() => useAvailableScopes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scopes).toContain('team');

    // Logout / identity switch: AuthManager clears auth state.
    await act(async () => {
      triggerAuthCleared();
      await Promise.resolve();
    });

    // The evicted cache never re-exposes user A's 'team' scope to user B.
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.scopes).not.toContain('team');
    });
    expect(result.current.scopes).toEqual(['personal', 'global']);
  });

  it('invalidateAvailableScopes resets to the unfetched baseline', async () => {
    mockGetScopes.mockResolvedValueOnce(['personal', 'team', 'global']);
    const { result } = renderHook(() => useAvailableScopes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scopes).toContain('team');

    mockGetScopes.mockResolvedValue(['personal', 'global']);
    act(() => {
      invalidateAvailableScopes();
    });

    await waitFor(() => expect(result.current.scopes).not.toContain('team'));
  });

  it('falls back to the always-available scopes on fetch error', async () => {
    mockGetScopes.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useAvailableScopes());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scopes).toEqual(['personal', 'global']);
    expect(result.current.error).toBe('boom');
  });
});
