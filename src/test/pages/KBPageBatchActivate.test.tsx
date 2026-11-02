import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import KBPage from '../../pages/KBPage';
import * as api from '../../lib/api';
import * as conversion from '../../lib/knowledge/conversion';
import type { BatchVerifyItemResult, BatchVerifyResponse } from '../../lib/knowledge/conversion';
import { APIError } from '../../lib/knowledge/errors';
import { makeConversion, makeDraftSummary } from '../support/kbDrafts';

/**
 * verify-batch reports each draft as `verified`, `failed`, `skipped`,
 * `forbidden`, `unknown` or `deferred`, and the page counts and shows every one
 * wherever the batch ran (faultmaven#2430, #2055). The summary used to render
 * only inside the first-time banner, so a Drafts-tab Activate with any runbook
 * present showed nothing at all, and only three statuses were counted.
 */

vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  uploadDocument: vi.fn(),
  uploadAdminDocument: vi.fn(),
  listDocuments: vi.fn(),
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
  getConversion: vi.fn(),
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

const listDocuments = vi.mocked(api.listDocuments);
const listAllDrafts = vi.mocked(conversion.listAllDrafts);
const getConversion = vi.mocked(conversion.getConversion);
const verifyBatch = vi.mocked(conversion.verifyBatch);

// Core's own sentences (conversion_service `verify_batch`, contract 14.12.0).
const FORBIDDEN = 'You can only publish a runbook to a team you belong to';
const UNKNOWN = 'The runbook may have been published. Check the knowledge base before retrying.';
const DEFERRED = 'Not verified: this request had no indexing time left for it. Verify it again.';

const TITLES = ['Redis out of memory', 'Disk full', 'Kafka lag', 'TLS expired', 'DNS fails', 'Pod restarts', 'Node not ready'];
const drafts = (n: number) =>
  TITLES.slice(0, n).map((title, i) => makeDraftSummary({ conversion_id: `conv-${i}`, draft_id: `draft-${i}`, title }));

const item = (i: number, status: string, error: string | null = null): BatchVerifyItemResult => ({
  conversion_id: `conv-${i}`, draft_id: `draft-${i}`, status, error, knowledge_item_id: null,
});

/** Core's answer: the counters are the results' own. */
function answer(results: BatchVerifyItemResult[]): BatchVerifyResponse {
  const count = (status: string) => results.filter((r) => r.status === status).length;
  return {
    total: results.length, results,
    verified: count('verified'), failed: count('failed'), skipped: count('skipped'),
    forbidden: count('forbidden'), unknown: count('unknown'), deferred: count('deferred'),
  };
}

/** `n` runbooks the viewer does not own: listed, but with no checkbox of their own. */
const runbooks = (n: number) => ({
  documents: Array.from({ length: n }, (_, i) => ({
    document_id: `doc-${i}`, title: `Runbook ${i}`, content: '# Runbook', document_type: 'runbook',
    scope: 'personal', owner_id: 'u-2', tags: [], created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
  })),
  total_count: n, limit: 20, offset: 0,
});

async function renderKB(path: string, draftCount: number, runbookCount: number) {
  listAllDrafts.mockResolvedValue(drafts(draftCount));
  listDocuments.mockResolvedValue(runbooks(runbookCount));
  await act(async () => {
    render(<MemoryRouter initialEntries={[path]}><KBPage /></MemoryRouter>);
  });
  // The Drafts tab lists them; the Runbooks tab shows the banner instead.
  await screen.findByText(path.includes('tab=drafts') ? TITLES[0] : /ready to ingest/);
}

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

/** The Drafts tab's Activate over every draft. */
async function activateSelected() {
  await click(screen.getByRole('checkbox', { name: 'Select all' }));
  await click(screen.getByRole('button', { name: 'Activate' }));
}

const summary = () => screen.getByRole('status');
const checkedRows = () =>
  (within(screen.getByRole('region', { name: 'Drafts' })).getAllByRole('checkbox') as HTMLInputElement[]).map((box) => box.checked);
const lines = () => Array.from(summary().querySelectorAll('p'), (p) => p.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  verifyBatch.mockReset();
  localStorage.clear();
});

describe('KBPage — a batch activation shows every status verify-batch reports', () => {
  it('Drafts-tab Activate with a runbook present: each status, its first title, the server\'s sentence (#2430)', async () => {
    await renderKB('/kb?tab=drafts', 5, 1);
    verifyBatch.mockResolvedValueOnce(answer([
      item(0, 'forbidden', FORBIDDEN), item(1, 'forbidden', FORBIDDEN), item(2, 'unknown', UNKNOWN),
      item(3, 'deferred', DEFERRED), item(4, 'deferred', DEFERRED),
    ]));

    await activateSelected();

    expect(lines()).toEqual([
      'Nothing activated: 2 not allowed, 1 may have been published, 2 deferred.',
      `“Redis out of memory”: ${FORBIDDEN} (and 1 more)`,
      `“Kafka lag”: ${UNKNOWN}`,
      `“TLS expired”: ${DEFERRED} (and 1 more)`,
    ]);
  });

  it('Activate All: the summary outlives the banner a new runbook removes, and the Drafts tab opens on the deferred', async () => {
    await renderKB('/kb', 7, 0);
    // The first runbook exists once the batch has activated some.
    listDocuments.mockResolvedValue(runbooks(2));
    verifyBatch
      .mockResolvedValueOnce(answer([
        item(0, 'verified'), item(1, 'verified'), item(2, 'forbidden', FORBIDDEN),
        item(3, 'unknown', UNKNOWN), item(4, 'deferred', DEFERRED),
      ]))
      .mockResolvedValueOnce(answer([item(5, 'deferred', DEFERRED), item(6, 'deferred', DEFERRED)]));

    await click(screen.getByRole('button', { name: 'Activate All' }));

    // The banner is gone, a runbook now exists, and the deferred drafts are selected to activate again.
    expect(screen.queryByRole('button', { name: 'Activate All' })).not.toBeInTheDocument();
    expect(checkedRows()).toEqual([false, false, false, false, true, true, true]);
    expect(lines()).toEqual([
      'Done. 2 activated, 1 not allowed, 1 may have been published, 3 deferred.',
      `“Kafka lag”: ${FORBIDDEN}`,
      `“TLS expired”: ${UNKNOWN}`,
      `“DNS fails”: ${DEFERRED} (and 2 more)`,
    ]);
  });

  it('sums every chunk: a later request activates after an earlier one deferred', async () => {
    await renderKB('/kb?tab=drafts', 7, 1);
    verifyBatch
      .mockResolvedValueOnce(answer([
        item(0, 'verified'), item(1, 'verified'), item(2, 'verified'),
        item(3, 'deferred', DEFERRED), item(4, 'deferred', DEFERRED),
      ]))
      .mockResolvedValueOnce(answer([item(5, 'verified'), item(6, 'verified')]));

    await activateSelected();

    expect(verifyBatch).toHaveBeenCalledTimes(2);
    expect(lines()[0]).toBe('Done. 5 activated, 2 deferred.');
  });

  it('keeps selected exactly the deferred drafts the reloaded list still holds', async () => {
    await renderKB('/kb?tab=drafts', 4, 1);
    listAllDrafts.mockResolvedValue(drafts(3)); // draft-3 is gone when the list reloads
    verifyBatch.mockResolvedValueOnce(answer([
      item(0, 'verified'), item(1, 'deferred', DEFERRED), item(2, 'failed', 'Draft not found'), item(3, 'deferred', DEFERRED),
    ]));

    await activateSelected();

    expect(checkedRows()).toEqual([false, true, false]);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('restores no selection when the tab changed while the batch ran', async () => {
    await renderKB('/kb?tab=drafts', 2, 1);
    let finish!: () => void;
    verifyBatch.mockReturnValueOnce(new Promise((resolve) => {
      finish = () => resolve(answer([item(0, 'deferred', DEFERRED), item(1, 'deferred', DEFERRED)]));
    }));
    await activateSelected();
    await click(screen.getByRole('button', { name: /^Runbooks/ }));
    await click(screen.getByRole('button', { name: /^Drafts/ }));

    await act(async () => finish());

    expect(checkedRows()).toEqual([false, false]);
  });

  it('reads an older core without forbidden, unknown or deferred as the positive text', async () => {
    await renderKB('/kb?tab=drafts', 3, 1);
    verifyBatch.mockResolvedValueOnce({
      total: 3, verified: 3, failed: 0, skipped: 0, results: [item(0, 'verified'), item(1, 'verified'), item(2, 'verified')],
    });

    await activateSelected();

    expect(lines()).toEqual(['Done. 3 activated.']);
    expect(summary()).toHaveClass('text-fm-success');
  });

  it('counts a status this page does not know as another outcome, with its first title and sentence', async () => {
    await renderKB('/kb?tab=drafts', 3, 1);
    verifyBatch.mockResolvedValueOnce(answer([
      item(0, 'verified'), item(1, 'quarantined', 'Held for review'), item(2, 'quarantined', 'Held for review'),
    ]));

    await activateSelected();

    expect(lines()).toEqual(['Done. 1 activated, 2 with another outcome.', '“Disk full”: Held for review (and 1 more)']);
  });

  it('counts an unknown status off the results when the answer has no total', async () => {
    await renderKB('/kb?tab=drafts', 2, 1);
    // Off the wire: a body that leaves out `total`.
    verifyBatch.mockResolvedValueOnce(JSON.parse(JSON.stringify({
      verified: 1, results: [item(0, 'verified'), item(1, 'quarantined', 'Held for review')],
    })));

    await activateSelected();

    expect(lines()[0]).toBe('Done. 1 activated, 1 with another outcome.');
    expect(summary()).toHaveClass('text-fm-warning');
  });

  it('counts a chunk whose request failed as failed, with the request\'s own sentence', async () => {
    await renderKB('/kb?tab=drafts', 2, 1);
    verifyBatch.mockRejectedValueOnce(new APIError('Too many requests. Retry in about 30 seconds.', 429));

    await activateSelected();

    expect(lines()).toEqual([
      'Nothing activated: 2 failed.',
      '“Redis out of memory”: Too many requests. Retry in about 30 seconds. (and 1 more)',
    ]);
  });

  it('an all-deferred Activate All leaves Activate All on screen and clickable', async () => {
    await renderKB('/kb', 5, 0);
    verifyBatch.mockResolvedValueOnce(answer([0, 1, 2, 3, 4].map((i) => item(i, 'deferred', DEFERRED))));

    await click(screen.getByRole('button', { name: 'Activate All' }));

    expect(lines()[0]).toBe('Nothing activated: 5 deferred.');
    expect(screen.getByText('5 selected')).toBeInTheDocument();
    const again = screen.getByRole('button', { name: 'Activate All' });
    expect(again).toBeEnabled();
    verifyBatch.mockReturnValueOnce(new Promise(() => {}));
    await click(again);
    expect(verifyBatch).toHaveBeenCalledTimes(2);
  });

  it('the summary is a polite warning status, Dismiss removes it, and the next batch clears it', async () => {
    await renderKB('/kb?tab=drafts', 2, 1);
    verifyBatch.mockResolvedValue(answer([item(0, 'verified'), item(1, 'deferred', DEFERRED)]));

    await activateSelected();
    expect(summary()).toHaveClass('text-fm-warning');
    await click(within(summary()).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await activateSelected();
    expect(summary()).toBeInTheDocument();
    verifyBatch.mockReturnValueOnce(new Promise(() => {}));
    // The deferred draft is still selected: Activate runs it again at once.
    await click(screen.getByRole('button', { name: 'Activate' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('the summary stays on screen with the editor open', async () => {
    await renderKB('/kb?tab=drafts', 2, 1);
    verifyBatch.mockResolvedValueOnce(answer([item(0, 'verified'), item(1, 'deferred', DEFERRED)]));
    await activateSelected();
    getConversion.mockResolvedValue(makeConversion());

    await click(screen.getByRole('button', { name: /Redis out of memory/ }));
    await click(await screen.findByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('textbox', { name: 'Runbook content' })).toBeInTheDocument();
    expect(lines()).toEqual(['Done. 1 activated, 1 deferred.', `“Disk full”: ${DEFERRED}`]);
  });

  it('Activate All stays disabled until the batch\'s drafts reload has landed', async () => {
    await renderKB('/kb', 2, 0);
    let reloaded!: () => void;
    listAllDrafts.mockReturnValueOnce(new Promise((resolve) => {
      reloaded = () => resolve(drafts(2));
    }));
    verifyBatch.mockResolvedValueOnce(answer([item(0, 'deferred', DEFERRED), item(1, 'deferred', DEFERRED)]));

    await click(screen.getByRole('button', { name: 'Activate All' }));
    expect(screen.getByRole('button', { name: 'Activate All' })).toBeDisabled();

    await act(async () => reloaded());
    expect(screen.getByRole('button', { name: 'Activate All' })).toBeEnabled();
  });
});
