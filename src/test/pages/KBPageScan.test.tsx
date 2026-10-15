import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import KBPage from '../../pages/KBPage';
import * as conversion from '../../lib/knowledge/conversion';
import { APIError, NetworkError } from '../../lib/knowledge/errors';
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

  it('shows the network\'s sentence when the API cannot be reached', async () => {
    const unreachable = 'Could not reach the FaultMaven API at http://localhost:8090. It may be offline.';
    scanForRunbooks.mockRejectedValue(new NetworkError(unreachable));
    await renderDraftsTab('standalone');

    await clickScan();

    expect(screen.getByRole('alert')).toHaveTextContent(unreachable);
  });

  it('does not show the page\'s own error text for a 2xx whose body is not JSON', async () => {
    // `response.json()` on an HTML body: not the server\'s answer, and nothing a user can act on.
    scanForRunbooks.mockRejectedValue(new SyntaxError("Unexpected token '<', \"<!doctype \"... is not valid JSON"));
    await renderDraftsTab('standalone');

    await clickScan();

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Scan failed.');
    expect(banner).not.toHaveTextContent('Unexpected token');
  });

  it('describes a 2xx body that leaves out fields without throwing', async () => {
    // The wire is not validated: this is a body with `discovered` and `drafts` only.
    scanForRunbooks.mockResolvedValue(JSON.parse('{"discovered": 1, "drafts": []}'));
    await renderDraftsTab('standalone');

    await clickScan();

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Imported 1 runbook file as a draft.');
    expect(banner).toHaveClass('text-fm-success');
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

describe("KBPage Drafts tab — the scan banner shows the scan's notes (faultmaven#1986)", () => {
  const NOTE = 'team_x/foo.md imported as personal: this deployment has no teams to share it with';

  beforeEach(() => {
    vi.clearAllMocks();
    listAllDrafts.mockResolvedValue([]);
  });

  async function scanAnswering(answer: Awaited<ReturnType<typeof conversion.scanForRunbooks>>) {
    scanForRunbooks.mockResolvedValue(answer);
    await renderDraftsTab('standalone');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Scan for runbooks/ }));
    });
    return screen.getByRole('status');
  }

  it('shows nothing extra when the body carries no notes (a core older than #1997)', async () => {
    const banner = await scanAnswering({ discovered: 1, skipped: 0, errors: [], drafts: [] });

    expect(banner.textContent).toBe('Imported 1 runbook file as a draft.');
    expect(banner).not.toHaveTextContent('imported as personal');
    expect(banner).not.toHaveTextContent('more');
  });

  it('shows nothing extra for an empty notes list', async () => {
    const banner = await scanAnswering({ discovered: 1, skipped: 0, errors: [], notes: [], drafts: [] });

    expect(banner.textContent).toBe('Imported 1 runbook file as a draft.');
  });

  it('shows a single note verbatim', async () => {
    const banner = await scanAnswering({ discovered: 1, skipped: 0, errors: [], notes: [NOTE], drafts: [] });

    expect(banner).toHaveTextContent(NOTE);
    expect(banner.textContent).toBe(`Imported 1 runbook file as a draft. ${NOTE}.`);
    expect(banner).not.toHaveTextContent('more');
    // Informational: plain success, not the warning a refused file earns.
    expect(banner).toHaveClass('text-fm-success');
    expect(banner).not.toHaveClass('text-fm-warning');
  });

  it('shows the first of three notes plus "and 2 more"', async () => {
    const banner = await scanAnswering({
      discovered: 3,
      skipped: 0,
      errors: [],
      notes: [NOTE, 'team_x/bar.md imported as personal: second', 'team_y/baz.md imported as personal: third'],
      drafts: [],
    });

    expect(banner).toHaveTextContent(`${NOTE} (and 2 more like it)`);
    expect(banner).not.toHaveTextContent('team_x/bar.md');
    expect(banner).not.toHaveTextContent('team_y/baz.md');
  });

  it('shows notes and errors together, in the errors tone', async () => {
    const banner = await scanAnswering({
      discovered: 1,
      skipped: 0,
      errors: ['bad.md: too short (50 chars)'],
      notes: [NOTE],
      drafts: [],
    });

    expect(banner).toHaveTextContent('1 file could not be imported (bad.md: too short (50 chars))');
    expect(banner).toHaveTextContent(NOTE);
    expect(banner).toHaveClass('text-fm-warning');
    expect(banner).not.toHaveClass('text-fm-success');
  });

  it('shows notes even when nothing was counted as discovered, rather than "No new runbook files found."', async () => {
    const banner = await scanAnswering({ discovered: 0, skipped: 0, errors: [], notes: [NOTE], drafts: [] });

    expect(banner).toHaveTextContent(NOTE);
    expect(banner).not.toHaveTextContent('No new runbook files found.');
    expect(banner).toHaveClass('text-fm-success');
  });

  it('renders nothing for note elements that are not non-blank strings', async () => {
    // The wire is not validated: [null], [{}], [""] and [" "] are not sentences.
    const banner = await scanAnswering(
      JSON.parse('{"discovered": 1, "skipped": 0, "errors": [], "notes": [null, {}, "", "   ", 7], "drafts": []}'),
    );

    expect(banner.textContent).toBe('Imported 1 runbook file as a draft.');
  });

  it('counts only the valid notes toward "and N more like it"', async () => {
    const banner = await scanAnswering(
      JSON.parse(`{"discovered": 2, "skipped": 0, "errors": [], "notes": [null, "${NOTE}", "", "second note"], "drafts": []}`),
    );

    expect(banner).toHaveTextContent(`${NOTE} (and 1 more like it)`);
  });

  it('lets the banner text wrap, so a deep path never pushes Dismiss off-screen', async () => {
    // happy-dom has no layout: the classes are the observable. Without min-w-0 the flex
    // child cannot shrink below its longest unbreakable word; without break-words it
    // cannot wrap one. Both are in the built CSS.
    const deepPath = `team_${'a'.repeat(40)}/${'nested-directory-name/'.repeat(8)}runbook.md`;
    const banner = await scanAnswering({
      discovered: 1,
      skipped: 0,
      errors: [`${deepPath}: too short (50 chars)`],
      notes: [`${deepPath} imported as personal: this deployment has no teams to share it with`],
      drafts: [],
    });

    const text = within(banner).getByText(/imported as personal/);
    expect(text).toHaveClass('min-w-0', 'break-words');
    expect(text).toHaveTextContent(deepPath);
    // The same span carries the errors, and the dismiss control stays a sibling of it.
    expect(text).toHaveTextContent('could not be imported');
    expect(within(banner).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('does not throw on a notes field that is not a list', async () => {
    const banner = await scanAnswering(JSON.parse('{"discovered": 1, "skipped": 0, "errors": [], "notes": "oops", "drafts": []}'));

    expect(banner.textContent).toBe('Imported 1 runbook file as a draft.');
  });
});
