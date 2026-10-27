import { useEffect } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import KBPage from '../../pages/KBPage';
import * as conversion from '../../lib/knowledge/conversion';
import { makeDraftSummary } from '../support/kbDrafts';

/**
 * Activate All ends by switching to the Runbooks tab, and the tab is in the
 * URL. A batch that finishes after the user left /kb must not navigate them
 * back (#264): React Router's navigate still fires from an unmounted page,
 * resolving `?…` against /kb, and its `replace` overwrote the history entry
 * of the page the user had gone to.
 */

vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  uploadDocument: vi.fn(),
  uploadAdminDocument: vi.fn(),
  listDocuments: vi.fn().mockResolvedValue({ documents: [], total_count: 0, limit: 20, offset: 0 }),
  listAdminDocuments: vi.fn().mockResolvedValue({ documents: [], total_count: 0, limit: 20, offset: 0 }),
  deleteDocument: vi.fn(),
  deleteAdminDocument: vi.fn(),
  authManager: {
    getAuthState: vi.fn().mockResolvedValue(null),
    saveAuthState: vi.fn(),
    clearAuthState: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue(null),
  },
  config: { apiUrl: 'http://localhost:8090' },
}));

vi.mock('../../lib/knowledge/conversion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/knowledge/conversion')>()),
  listAllDrafts: vi.fn(),
  verifyBatch: vi.fn(),
}));

vi.mock('../../hooks/useNavigationItems', () => ({ useNavigationItems: () => [] }));
vi.mock('../../hooks/useAvailableScopes', () => ({
  useAvailableScopes: () => ({ scopes: ['personal'], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => ({ managementConsole: false, teamSharing: false, multiTenant: true, loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    deployment: 'cloud',
    role: 'individual',
    isAdmin: false,
    authState: { user: { user_id: 'u-1' } },
    clearAuthState: vi.fn(),
  }),
}));

const listAllDrafts = vi.mocked(conversion.listAllDrafts);
const verifyBatch = vi.mocked(conversion.verifyBatch);

const router: { go?: (to: string) => void; at?: string } = {};
function RouterProbe() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    router.go = navigate;
    router.at = location.pathname + location.search;
  }, [navigate, location]);
  return null;
}

/** Renders /kb at `path`, beside a stand-in case page, and starts Activate All. */
async function startActivateAll(path: string): Promise<() => Promise<void>> {
  listAllDrafts.mockResolvedValue([makeDraftSummary({ status: 'draft' })]);
  let answer: () => void = () => {};
  verifyBatch.mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = () => resolve({ total: 1, verified: 1, failed: 0, skipped: 0, results: [] });
      }),
  );
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <RouterProbe />
        <Routes>
          <Route path="/kb" element={<KBPage />} />
          <Route path="/cases/:caseId" element={<p>The case page</p>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  fireEvent.click(await screen.findByRole('button', { name: /Activate All/ }));
  expect(verifyBatch).toHaveBeenCalledTimes(1);
  return async () => {
    await act(async () => {
      answer();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  router.go = undefined;
  router.at = undefined;
});

describe('KBPage — Activate All finishing after the user left /kb', () => {
  it('leaves the user on the page they went to', async () => {
    const finish = await startActivateAll('/kb');

    await act(async () => {
      router.go?.('/cases/abc');
    });
    expect(router.at).toBe('/cases/abc');

    await finish();

    expect(router.at).toBe('/cases/abc');
    expect(screen.getByText('The case page')).toBeInTheDocument();
  });

  it('still switches to the Runbooks tab when the user stayed on /kb', async () => {
    const finish = await startActivateAll('/kb?tab=drafts');
    expect(router.at).toBe('/kb?tab=drafts');

    await finish();

    expect(router.at).toBe('/kb');
  });
});
