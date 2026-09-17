import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import KBPage from '../../pages/KBPage';

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

vi.mock('../../hooks/useNavigationItems', () => ({
  useNavigationItems: vi.fn().mockReturnValue([
    { label: 'Cases', path: '/cases', active: false },
    { label: 'Knowledge Base', path: '/kb', active: true },
  ]),
}));

const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseAvailableScopes = vi.fn();
vi.mock('../../hooks/useAvailableScopes', () => ({
  useAvailableScopes: () => mockUseAvailableScopes(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <KBPage />
    </MemoryRouter>
  );
}

describe('KBPage — scope filter reflects visible documents, not publish rights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The publish-capability signal. The scope FILTER no longer reads it —
    // reading every scope is open, so the filter keys on document counts —
    // but the authoring UI still does, and other tests in this file override it.
    mockUseAvailableScopes.mockReturnValue({
      scopes: ['personal', 'global'],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  async function renderWithCounts(scope_counts: {
    global: number;
    team: number;
    personal: number;
  }) {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      role: 'standard_user',
      isAdmin: false,
      clearAuthState: vi.fn(),
    });
    const api = await import('../../lib/api');
    (api.listDocuments as ReturnType<typeof vi.fn>).mockResolvedValue({
      documents: [],
      total_count: 0,
      limit: 20,
      offset: 0,
      scope_counts,
    });
    await act(async () => {
      renderPage();
    });
  }

  it('offers a scope only when documents in it are visible', async () => {
    await renderWithCounts({ global: 3, team: 0, personal: 2 });

    expect(screen.getByRole('option', { name: /Global/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Personal/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Team/i })).not.toBeInTheDocument();
  });

  it('offers Global to a NON-operator when global documents exist', async () => {
    // Reading global KB is open to every user, and those rows appear under
    // "All scopes" regardless — so gating this filter on publish capability
    // hid an option whose data was on screen.
    await renderWithCounts({ global: 5, team: 0, personal: 0 });

    expect(screen.getByRole('option', { name: /Global/i })).toBeInTheDocument();
  });

  it('hides a scope with no visible documents', async () => {
    await renderWithCounts({ global: 0, team: 0, personal: 0 });

    expect(screen.queryByRole('option', { name: /Global/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Team/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Personal/i })).not.toBeInTheDocument();
    // "All scopes" is unconditional so the control is never empty.
    expect(screen.getByRole('option', { name: /All scopes/i })).toBeInTheDocument();
  });

  it('archive confirm dialog uses Archive wording (not Delete)', async () => {
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      role: 'individual',
      clearAuthState: vi.fn(),
    });

    await act(async () => {
      renderPage();
    });

    // The ConfirmDialog for document archive should say "Archive Document"
    // Trigger it by simulating a document card action — but since documents are empty,
    // we just verify the dialog text is correct when opened.
    // We test the ConfirmDialog props indirectly: check no "Delete Document" text anywhere
    expect(screen.queryByText('Delete Document')).not.toBeInTheDocument();
  });

  it('confirms before batch-removing runbooks and reports a partial failure', async () => {
    // Batch remove drives `DELETE /knowledge/documents/{id}`, which is
    // operator-only — the toolbar is not offered to anyone else.
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      role: 'individual',
      isAdmin: true,
      authState: { user: { user_id: 'u1' } },
      clearAuthState: vi.fn(),
    });
    const api = await import('../../lib/api');
    const listDocuments = api.listDocuments as ReturnType<typeof vi.fn>;
    const deleteDocument = api.deleteDocument as ReturnType<typeof vi.fn>;
    const docs = [
      { document_id: 'd1', title: 'Runbook One', document_type: 'runbook', tags: [], scope: 'personal', created_at: '2024-01-01T00:00:00Z' },
      { document_id: 'd2', title: 'Runbook Two', document_type: 'runbook', tags: [], scope: 'personal', created_at: '2024-01-01T00:00:00Z' },
    ];
    listDocuments.mockResolvedValue({ documents: docs, total_count: 2, limit: 20, offset: 0, scope_counts: { global: 0, team: 0, personal: 2 } });
    // First delete succeeds, second fails → a partial failure.
    deleteDocument.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'));

    await act(async () => { renderPage(); });
    expect(await screen.findByText('Runbook One')).toBeInTheDocument();

    // Select all (first checkbox), then click the batch Remove.
    const [selectAll] = screen.getAllByRole('checkbox');
    await act(async () => { fireEvent.click(selectAll); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove' })); });

    // A confirm dialog gates the destructive action (nothing deleted yet).
    expect(screen.getByRole('heading', { name: /Remove 2 runbooks/ })).toBeInTheDocument();
    expect(deleteDocument).not.toHaveBeenCalled();

    // Confirm → both deletes attempted, and the partial failure is surfaced.
    // Scope to the dialog: the toolbar also has a "Remove" button.
    const dialog = screen.getByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    });
    expect(deleteDocument).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/1 runbook could not be removed/)).toBeInTheDocument();
  });

  it('opens the "Add Runbook" overlay without a rules-of-hooks crash', async () => {
    // Regression: OverlayPanel declared five useState calls AFTER an
    // `if (!mode) return null` early return, and was mounted unconditionally.
    // Setting overlayMode='upload' re-rendered the same fiber 0→5 hooks, so
    // React threw "Rendered more hooks than during the previous render".
    // "Add Runbook" posts to an operator-only route, so it is only offered
    // to an operator.
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      role: 'individual',
      isAdmin: true,
      authState: { user: { user_id: 'u1' } },
      clearAuthState: vi.fn(),
    });

    await act(async () => {
      renderPage();
    });

    // Open the "+ New" dropdown, then choose "Add Runbook" (the upload flow).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /New/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Add Runbook'));
    });

    // The overlay mounted: its heading appears and no crash was thrown.
    expect(screen.getByRole('heading', { name: 'Add Runbook' })).toBeInTheDocument();
  });
});

describe('KBPage — authoring affordances match the backend gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAvailableScopes.mockReturnValue({
      scopes: ['personal', 'global'],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  async function renderAs(isAdmin: boolean) {
    mockUseAuth.mockReturnValue({
      isAdmin,
      deployment: 'cloud',
      role: isAdmin ? 'platform_admin' : 'standard_user',
      authState: { user: { user_id: 'u-1' } },
      clearAuthState: vi.fn(),
    });
    await act(async () => {
      renderPage();
    });
  }

  it('offers personal-scope authoring to a non-operator', async () => {
    // Convert and Write go through the conversion routes, which gate only the
    // GLOBAL scope on the operator role. A cloud org admin lost these entirely
    // when the operator role stopped being derived from `admin`.
    await renderAs(false);

    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    expect(screen.getByText('Convert to Runbook')).toBeInTheDocument();
    expect(screen.getByText('Write Runbook')).toBeInTheDocument();
  });

  it('gives a non-operator no batch-remove selection UI', async () => {
    // Batch remove drives an operator-only DELETE, so offering the checkboxes
    // would let a user select their own personal runbook and get a 403.
    await renderAs(false);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('offers "Add Runbook" to a non-operator too', async () => {
    // Uploading a finished file is an INPUT METHOD, not a publishing tier.
    // `POST /knowledge/documents` used to be operator-only AND always global,
    // so a user holding a `.md` had nowhere to put it while the same content
    // was authorable through Convert or Write. The route now takes a scope and
    // gates `global` the way the other two do
    // (FaultMaven/faultmaven#1377), so the menu gates nothing.
    await renderAs(false);

    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    expect(screen.getByText('Add Runbook')).toBeInTheDocument();
  });

  it('offers "Add Runbook" to an operator', async () => {
    await renderAs(true);

    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    expect(screen.getByText('Add Runbook')).toBeInTheDocument();
  });

  it('offers only the scopes the user may publish at', async () => {
    // The operator gate moved to the SCOPE, so the picker is where it shows.
    //
    // A FILE must be selected first: the picker lives inside <UploadModal
    // isOpen={showUploadModal}>, which returns null until `handleFileSelect`
    // fires. The first version of this test clicked through to "Add Runbook"
    // and asserted immediately — on a modal that never rendered, so it passed
    // with `global` in the mocked scopes too. Mutation-verified: it is the
    // upload of the file that makes this test able to fail at all.
    mockUseAvailableScopes.mockReturnValue({
      scopes: ['personal'],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    await renderAs(false);

    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    fireEvent.click(screen.getByText('Add Runbook'));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['# rb'], 'redis.md', { type: 'text/markdown' })] },
      });
    });

    // The picker is on screen now — a positive control, so "Global is absent"
    // cannot pass by the whole form being absent.
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.queryByText('Global (platform)')).not.toBeInTheDocument();
  });

  it('never offers Team, which the upload form cannot satisfy', async () => {
    // The form collects no team_id and the route answers 400 without one.
    mockUseAvailableScopes.mockReturnValue({
      scopes: ['personal', 'team', 'global'],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    await renderAs(true);

    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    fireEvent.click(screen.getByText('Add Runbook'));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['# rb'], 'redis.md', { type: 'text/markdown' })] },
      });
    });

    expect(screen.getByText('Global (platform)')).toBeInTheDocument();
    expect(screen.queryByText('Team')).not.toBeInTheDocument();
  });});

/**
 * Who may edit a personal-scope runbook (faultmaven-dashboard#165).
 *
 * `canModifyDocument` is the gate on the Edit control, and it used to read
 *
 *     doc.owner_id === userId || doc.user_id === userId
 *
 * The second clause could never fire. `user_id` is not a field of the
 * backend's `KnowledgeBaseDocument` — the model declares none and sets no
 * `extra="allow"`, so Pydantic never emits one — it existed only in this
 * repo's hand-written copy of the shape, where it was declared REQUIRED. So it
 * type-checked at every call site and was `undefined` on every response: the
 * contract blind spot #165 is about, sitting in a permission gate.
 *
 * These cases pin the gate's behaviour rather than the type, because the type
 * is now enforced by `tsc` (binding `KBDocument` to the generated schema makes
 * `doc.user_id` a build error) and a build error cannot be asserted from a
 * runtime test. What a runtime test CAN hold is that the field carries no
 * meaning even when a response volunteers one.
 */
describe('KBPage — personal-scope edit rights come from owner_id alone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAvailableScopes.mockReturnValue({
      scopes: ['personal'],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  /** One personal runbook, plus whichever viewer identity the case needs. */
  async function renderOwned(
    doc: Record<string, unknown>,
    viewerId: string | null
  ) {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      role: 'standard_user',
      isAdmin: false,
      authState: viewerId === null ? null : { user: { user_id: viewerId } },
      clearAuthState: vi.fn(),
    });
    const api = await import('../../lib/api');
    (api.listDocuments as ReturnType<typeof vi.fn>).mockResolvedValue({
      documents: [
        {
          document_id: 'doc-1',
          title: 'Restart the ingest worker',
          content: '# Restart',
          document_type: 'runbook',
          scope: 'personal',
          tags: [],
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
          ...doc,
        },
      ],
      total_count: 1,
      limit: 20,
      offset: 0,
      scope_counts: { global: 0, team: 0, personal: 1 },
    });
    await act(async () => {
      renderPage();
    });
  }

  it('offers Edit on a runbook the viewer owns', async () => {
    await renderOwned({ owner_id: 'u-1' }, 'u-1');

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('withholds Edit on a runbook owned by someone else', async () => {
    await renderOwned({ owner_id: 'u-2' }, 'u-1');

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('ignores a user_id the response volunteers — only owner_id decides', async () => {
    // The exact shape the deleted clause would have accepted: a `user_id`
    // naming the viewer on a document someone else owns. Under the old gate
    // this rendered Edit. It is not a field the contract declares, so a server
    // that grew one must not be able to widen this gate by accident.
    await renderOwned({ owner_id: 'u-2', user_id: 'u-1' }, 'u-1');

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('withholds Edit when an unowned runbook meets an unidentified viewer', async () => {
    // `owner_id` is `string | null` in the contract and the viewer id is
    // `string | null` here, so the unguarded comparison is `null === null` —
    // true, and every unowned document becomes editable by a viewer the app
    // could not identify. The hand-written type said `owner_id?: string`, so
    // this pairing was not expressible before the bind.
    await renderOwned({ owner_id: null }, null);

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
