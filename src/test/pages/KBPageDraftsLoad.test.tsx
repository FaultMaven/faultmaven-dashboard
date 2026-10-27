import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import KBPage from '../../pages/KBPage';
import * as conversion from '../../lib/knowledge/conversion';
import { APIError, NetworkError } from '../../lib/knowledge/errors';
import { makeDraftSummary } from '../support/kbDrafts';

/**
 * A drafts list that failed to load is not an empty one (#263). The failure
 * used to be swallowed, so a 500 or a dropped connection rendered "No draft
 * runbooks yet." or, under the Report tab's `?case=` deep link, "No drafts
 * found for this case. The draft may have been verified or deleted."
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
  scanForRunbooks: vi.fn(),
}));

vi.mock('../../hooks/useNavigationItems', () => ({ useNavigationItems: () => [] }));
vi.mock('../../hooks/useAvailableScopes', () => ({
  useAvailableScopes: () => ({ scopes: ['personal'], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => ({ managementConsole: false, teamSharing: false, multiTenant: true, loading: false, error: null, refetch: vi.fn() }),
}));

const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));

const listAllDrafts = vi.mocked(conversion.listAllDrafts);
const scanForRunbooks = vi.mocked(conversion.scanForRunbooks);

const SERVER_SAID = 'Internal server error while listing drafts';

async function renderAt(path: string, deployment: 'standalone' | 'cloud' = 'cloud') {
  mockUseAuth.mockReturnValue({
    deployment,
    role: 'individual',
    isAdmin: false,
    authState: { user: { user_id: 'u-1' } },
    clearAuthState: vi.fn(),
  });
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <KBPage />
      </MemoryRouter>,
    );
  });
}

function expectNoEmptyState() {
  expect(screen.queryByText('No draft runbooks yet.')).not.toBeInTheDocument();
  expect(screen.queryByText('None of your drafts came from this case.')).not.toBeInTheDocument();
  expect(screen.queryByText('All drafts have been verified.')).not.toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('KBPage Drafts tab — a failed load is shown, never an empty list', () => {
  it('shows the server’s sentence, and no empty state', async () => {
    listAllDrafts.mockRejectedValue(new APIError(SERVER_SAID, 500));

    await renderAt('/kb?tab=drafts');

    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_SAID);
    expectNoEmptyState();
  });

  it('under the Report tab’s ?case= link, does not say the case’s draft is gone', async () => {
    listAllDrafts.mockRejectedValue(new APIError(SERVER_SAID, 500));

    await renderAt('/kb?tab=drafts&case=case-X');

    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_SAID);
    expect(screen.getByText('Filtered by case')).toBeInTheDocument();
    expectNoEmptyState();
  });

  it('shows the network’s sentence for a dropped connection', async () => {
    listAllDrafts.mockRejectedValue(new NetworkError('Could not reach the FaultMaven API at http://localhost:8090'));

    await renderAt('/kb?tab=drafts');

    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the FaultMaven API at http://localhost:8090');
    expectNoEmptyState();
  });

  it('says only that the drafts could not be loaded for an error of the page’s own', async () => {
    listAllDrafts.mockRejectedValue(new SyntaxError("Unexpected token '<'"));

    await renderAt('/kb?tab=drafts');

    expect(screen.getByRole('alert')).toHaveTextContent('Your drafts could not be loaded.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Unexpected token');
    expectNoEmptyState();
  });

  it('Try again reloads, and a load that succeeds clears the error', async () => {
    listAllDrafts.mockRejectedValueOnce(new APIError(SERVER_SAID, 500)).mockResolvedValueOnce([]);
    await renderAt('/kb?tab=drafts');
    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_SAID);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });

    expect(listAllDrafts).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('No draft runbooks yet.')).toBeInTheDocument();
  });

  it('a failed refresh keeps the rows already on screen, under the error', async () => {
    listAllDrafts
      .mockResolvedValueOnce([makeDraftSummary({ title: 'Redis out of memory' })])
      .mockRejectedValueOnce(new APIError(SERVER_SAID, 503));
    scanForRunbooks.mockResolvedValue({ discovered: 0, skipped: 0, errors: [], notes: [], drafts: [] });
    await renderAt('/kb?tab=drafts', 'standalone');
    expect(screen.getByText('Redis out of memory')).toBeInTheDocument();

    // The scan reloads the list when it finishes; this reload fails.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Scan for runbooks/ }));
    });

    expect(listAllDrafts).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_SAID);
    expect(screen.getByText('Redis out of memory')).toBeInTheDocument();
  });
});
