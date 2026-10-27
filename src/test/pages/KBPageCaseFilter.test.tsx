import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import KBPage from '../../pages/KBPage';
import * as conversion from '../../lib/knowledge/conversion';
import { makeDraftSummary } from '../support/kbDrafts';

/**
 * The Drafts tab under the Report tab's `?case=` link (#262). The list is the
 * viewer's own drafts, and a case's runbook draft is the case creator's
 * (ADR-020 D6), so an empty filter names that, or a deletion. It never says
 * "verified": core still lists a verified draft.
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
    authState: { user: { user_id: 'u-bob' } },
    clearAuthState: vi.fn(),
  }),
}));

const listAllDrafts = vi.mocked(conversion.listAllDrafts);

async function renderFilteredTo(caseId: string) {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[`/kb?tab=drafts&case=${caseId}`]}>
        <KBPage />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('KBPage Drafts tab — filtered to one case', () => {
  it('with none of the viewer’s drafts from the case, names the two causes, never "verified"', async () => {
    listAllDrafts.mockResolvedValue([makeDraftSummary({ draft_id: 'd-other', case_id: 'case-Y', source_type: 'case' })]);

    await renderFilteredTo('case-X');

    expect(screen.getByText('None of your drafts came from this case.')).toBeInTheDocument();
    expect(
      screen.getByText(/A runbook draft generated from a case is in the case creator's Knowledge Base, and a deleted draft is not listed\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/verified/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all drafts' })).toBeInTheDocument();
  });

  it('lists the creator’s own draft from the case', async () => {
    listAllDrafts.mockResolvedValue([
      makeDraftSummary({ draft_id: 'd-1', case_id: 'case-X', source_type: 'case', title: 'Redis out of memory' }),
      makeDraftSummary({ draft_id: 'd-2', case_id: 'case-Y', source_type: 'case', title: 'Disk full on the API node' }),
    ]);

    await renderFilteredTo('case-X');

    expect(screen.getByText('Redis out of memory')).toBeInTheDocument();
    expect(screen.queryByText('Disk full on the API node')).not.toBeInTheDocument();
  });
});
