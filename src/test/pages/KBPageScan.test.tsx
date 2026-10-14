import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import KBPage from '../../pages/KBPage';
import * as conversion from '../../lib/knowledge/conversion';
import { APIError } from '../../lib/knowledge/errors';
import { makeDraftSummary } from '../support/kbDrafts';

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

const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));

const listAllDrafts = vi.mocked(conversion.listAllDrafts);
const scanForRunbooks = vi.mocked(conversion.scanForRunbooks);

const REFUSAL = 'This deployment has no runbook directory; upload or convert instead';

async function renderDraftsTab(deployment: 'standalone' | 'cloud' | null) {
  mockUseAuth.mockReturnValue({
    deployment,
    role: deployment ? 'individual' : null,
    isAdmin: false,
    authState: { user: { user_id: 'u-1' } },
    clearAuthState: vi.fn(),
  });
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/kb?tab=drafts']}>
        <KBPage />
      </MemoryRouter>,
    );
  });
}

describe('KBPage Drafts tab — the Scan control is offered only where the scan can run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAllDrafts.mockResolvedValue([]);
  });

  it('shows the Scan control on a standalone deployment', async () => {
    await renderDraftsTab('standalone');

    expect(screen.getByRole('button', { name: /Scan for runbooks/ })).toBeInTheDocument();
  });

  it('hides it on a cloud deployment', async () => {
    await renderDraftsTab('cloud');

    expect(screen.queryByRole('button', { name: /Scan for runbooks/ })).not.toBeInTheDocument();
  });

  it('hides it while the deployment is not yet confirmed (null)', async () => {
    await renderDraftsTab(null);

    expect(screen.queryByRole('button', { name: /Scan for runbooks/ })).not.toBeInTheDocument();
  });

  it('describes the scan as an import of hand-placed files, only where it is offered', async () => {
    await renderDraftsTab('standalone');
    expect(screen.getByText(/import files you placed in data\/knowledge\/ as drafts/)).toBeInTheDocument();
    // The reconciliation wording is gone.
    expect(screen.queryByText(/discover files/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scan for runbooks/ })).toHaveAttribute(
      'title',
      expect.stringMatching(/Import runbook files placed in data\/knowledge\/ as drafts/),
    );
  });

  it('does not point a cloud user at a Scan control that is not there', async () => {
    await renderDraftsTab('cloud');

    expect(screen.getByText('No draft runbooks yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Scan for runbooks/)).not.toBeInTheDocument();
    expect(screen.queryByText(/data\/knowledge/)).not.toBeInTheDocument();
  });
});

describe('KBPage Drafts tab — the scan banner shows what the server said', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAllDrafts.mockResolvedValue([]);
  });

  async function clickScan() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Scan for runbooks/ }));
    });
  }

  it("shows the server's refusal sentence, styled as a failure", async () => {
    scanForRunbooks.mockRejectedValue(new APIError(REFUSAL, 422, 'Unprocessable Entity', { detail: REFUSAL }));
    await renderDraftsTab('standalone');

    await clickScan();

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent(REFUSAL);
    expect(banner).toHaveClass('text-fm-critical');
    expect(banner).not.toHaveClass('text-fm-success');
    // The fixed guess it replaces.
    expect(screen.queryByText(/Check that data\/knowledge\/ exists/)).not.toBeInTheDocument();
  });

  it("shows a 500's own text rather than a guess at the cause", async () => {
    scanForRunbooks.mockRejectedValue(new APIError('Internal server error', 500));
    await renderDraftsTab('standalone');

    await clickScan();

    expect(screen.getByRole('alert')).toHaveTextContent('Internal server error');
  });

  it('falls back to a plain failure line for a rejection that is not an Error', async () => {
    scanForRunbooks.mockRejectedValue('boom');
    await renderDraftsTab('standalone');

    await clickScan();

    expect(screen.getByRole('alert')).toHaveTextContent('Scan failed.');
  });

  it('reports what was imported, skipped and refused, styled as a warning when any file failed', async () => {
    scanForRunbooks.mockResolvedValue({
      discovered: 2,
      skipped: 1,
      errors: ['bad.md: too short (50 chars)', 'huge.md: too long (200000 chars; a draft holds at most 100000)'],
      drafts: [],
    });
    await renderDraftsTab('standalone');

    await clickScan();

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Imported 2 runbook files as drafts');
    expect(banner).toHaveTextContent('1 skipped');
    expect(banner).toHaveTextContent('2 files could not be imported (bad.md: too short (50 chars); and 1 more)');
    expect(banner).toHaveClass('text-fm-warning');
    expect(banner).not.toHaveClass('text-fm-success');
  });

  it('is plain success when nothing was refused, and refreshes the list', async () => {
    scanForRunbooks.mockResolvedValue({ discovered: 1, skipped: 0, errors: [], drafts: [] });
    await renderDraftsTab('standalone');
    listAllDrafts.mockClear();
    listAllDrafts.mockResolvedValue([makeDraftSummary()]);

    await clickScan();

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Imported 1 runbook file as a draft');
    expect(banner).toHaveClass('text-fm-success');
    expect(listAllDrafts).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Redis out of memory')).toBeInTheDocument();
  });

  it('says so when the directory held nothing new', async () => {
    scanForRunbooks.mockResolvedValue({ discovered: 0, skipped: 0, errors: [], drafts: [] });
    await renderDraftsTab('standalone');

    await clickScan();

    expect(screen.getByRole('status')).toHaveTextContent('No new runbook files found.');
  });
});
