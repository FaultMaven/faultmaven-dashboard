import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import KBPage from '../../pages/KBPage';

const row = {
  document_id: 'doc-1', title: 'Restart the ingest worker', document_type: 'runbook',
  tags: [], scope: 'personal', owner_id: 'u-1', source_url: null,
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', metadata: {},
};
const listBody = { documents: [row], total_count: 1, limit: 20, offset: 0,
  scope_counts: { global: 0, team: 0, personal: 1 } };

vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  uploadDocument: vi.fn(), uploadAdminDocument: vi.fn(),
  listDocuments: vi.fn(), listAdminDocuments: vi.fn(),
  deleteDocument: vi.fn(), deleteAdminDocument: vi.fn(),
  authManager: { getAuthState: vi.fn().mockResolvedValue(null), saveAuthState: vi.fn(),
    clearAuthState: vi.fn(), getAccessToken: vi.fn().mockResolvedValue(null) },
  config: { apiUrl: 'http://localhost:8090' },
}));
vi.mock('../../lib/knowledge/kb', () => ({ getDocument: vi.fn(), updateDocument: vi.fn() }));
vi.mock('../../hooks/useNavigationItems', () => ({ useNavigationItems: () => [] }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({
  deployment: 'cloud', role: 'standard_user', isAdmin: false,
  authState: { user: { user_id: 'u-1' } }, clearAuthState: vi.fn() }) }));
vi.mock('../../hooks/useAvailableScopes', () => ({ useAvailableScopes: () => ({
  scopes: ['personal'], loading: false, error: null, refetch: vi.fn() }) }));

/**
 * An in-card save must survive the refresh it triggers.
 *
 * `DocumentCard.handleSave` calls `onUpdated()`, which `KBPage` wires to
 * `loadPage(page)`. That is the point of the callback — the list row holds a
 * stale body until it is refetched — but the refetch flips `useKBList`'s
 * `loading`, and `DocumentList` used to swap the whole list for a placeholder
 * while it was true. Every card unmounted mid-save.
 *
 * A `DocumentCard` keeps the document body in local state seeded from
 * `document.content`, and a LIST ROW carries no `content` at all
 * (`KBDocumentListItem`, #165). So the remounted card came back expanded and
 * empty: the user pressed Save and watched their work turn into
 * "No content available."
 *
 * ‼ This is a SEAM, and neither side can see it alone. `DocumentCard` tested
 * on its own passes with `onUpdated` as a bare `vi.fn()`; `DocumentList`
 * tested on its own has no save. It also needs the refetch to take LONGER THAN
 * A MICROTASK — with a zero-latency mock the two state updates coalesce into
 * one render and the unmount never happens, which is how the first draft of
 * this fix shipped green. Hence the deliberate 30 ms.
 */
describe('KBPage — an in-card save survives its own refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the saved body on screen while the refetch is in flight', async () => {
    const api = await import('../../lib/api');
    const kb = await import('../../lib/knowledge/kb');
    // First load resolves immediately; the refetch takes 30ms like a network.
    let call = 0;
    (api.listDocuments as ReturnType<typeof vi.fn>).mockImplementation(() => {
      call += 1;
      return call === 1 ? Promise.resolve(listBody)
        : new Promise((r) => setTimeout(() => r(listBody), 30));
    });
    (kb.getDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ ...row, content: '# Before' });
    (kb.updateDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ ...row, content: '# After' });

    await act(async () => { render(<MemoryRouter><KBPage /></MemoryRouter>); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Edit' })); });
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '# After' } });
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });

    // The regression rendered the placeholder in place of the saved body.
    expect(screen.queryByText('No content available.')).not.toBeInTheDocument();
    // And the refresh must actually have happened — otherwise this passes for
    // the wrong reason (a fix that simply stopped calling `onUpdated`).
    expect(api.listDocuments).toHaveBeenCalledTimes(2);
  });
});
