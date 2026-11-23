import { useEffect } from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
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
    authState: { user: { user_id: 'u-bob' } },
    clearAuthState: vi.fn(),
  }),
}));

const listAllDrafts = vi.mocked(conversion.listAllDrafts);
const verifyBatch = vi.mocked(conversion.verifyBatch);

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

describe('KBPage Drafts tab — a batch\'s hand-off holds its case filter', () => {
  // Two drafts from case-A, two from case-B, all deferred by the batch.
  const list = [0, 1, 2, 3].map((i) =>
    makeDraftSummary({ conversion_id: `conv-${i}`, draft_id: `draft-${i}`, title: `Draft ${i}`, case_id: i < 2 ? 'case-A' : 'case-B' }));
  const router: { go?: (to: string) => void } = {};
  function RouterProbe() {
    const navigate = useNavigate();
    useEffect(() => {
      router.go = (to) => navigate(to, { replace: true });
    }, [navigate]);
    return null;
  }
  const deferred = list.map((d) => ({ conversion_id: d.conversion_id, draft_id: d.draft_id, status: 'deferred', error: 'Verify it again.', knowledge_item_id: null }));

  const checkedRows = () =>
    (within(screen.getByRole('region', { name: 'Drafts' })).getAllByRole('checkbox') as HTMLInputElement[]).map((box) => box.checked);

  /**
   * A Drafts-tab batch that ends on the Runbooks tab under `?case=case-A`, so it
   * keeps case-A's deferred drafts for the Drafts tab. No page control leaves
   * Drafts keeping `?case=` (leaving Drafts drops it), so the test moves the URL
   * itself, as a deep link would.
   */
  async function handOffUnderCaseA() {
    listAllDrafts.mockResolvedValue(list);
    await act(async () => {
      render(<MemoryRouter initialEntries={['/kb?tab=drafts']}><RouterProbe /><KBPage /></MemoryRouter>);
    });
    let settle!: (answer: Awaited<ReturnType<typeof conversion.verifyBatch>>) => void;
    verifyBatch.mockReturnValueOnce(new Promise((resolve) => { settle = resolve; }));
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Activate' })); });
    // The batch ends on the Runbooks tab under case-A, so it keeps case-A's deferred drafts for the Drafts tab.
    await act(async () => { router.go?.('/kb?case=case-A'); });
    await act(async () => { settle({ total: 4, verified: 0, failed: 0, skipped: 0, deferred: 4, results: deferred }); });
  }

  // A pin of the clause that the hand-off applies only under its own case filter (faultmaven#2466 item 3).
  it.each([
    ['case-B', [false, false], null],
    ['case-A', [true, true], '2 selected'],
  ])('kept under case-A, the Drafts tab opened under %s selects %j', async (caseId, checked, count) => {
    await handOffUnderCaseA();

    await act(async () => { router.go?.(`/kb?tab=drafts&case=${caseId}`); });

    expect(checkedRows()).toEqual(checked);
    if (count) expect(screen.getByText(count)).toBeInTheDocument();
    else expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it('a click on Runbooks while Runbooks is open keeps the URL and the hand-off for the Drafts tab', async () => {
    await handOffUnderCaseA();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Runbooks/ })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Drafts/ })); });

    expect(screen.getByText('Filtered by case')).toBeInTheDocument();
    expect(checkedRows()).toEqual([true, true]);
  });
});
