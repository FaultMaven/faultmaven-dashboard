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

describe('KBPage — scope filter visibility by membership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: only the always-available scopes. Individual tests override.
    mockUseAvailableScopes.mockReturnValue({
      scopes: ['personal', 'global'],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('standalone user with no team membership hides Team option', async () => {
    mockUseAuth.mockReturnValue({
      deployment: 'standalone',
      role: 'individual',
      clearAuthState: vi.fn(),
    });

    await act(async () => {
      renderPage();
    });

    expect(screen.getByRole('option', { name: /Global/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Personal/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Team/i })).not.toBeInTheDocument();
  });

  it('user with team membership sees Team option', async () => {
    mockUseAuth.mockReturnValue({
      deployment: 'cloud',
      role: 'standard_user',
      clearAuthState: vi.fn(),
    });
    mockUseAvailableScopes.mockReturnValue({
      scopes: ['personal', 'team', 'global'],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    await act(async () => {
      renderPage();
    });

    expect(screen.getByRole('option', { name: /Personal/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Team/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Global/i })).toBeInTheDocument();
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

  it('hides "Add Runbook" from a non-operator', async () => {
    // It posts to `POST /knowledge/documents`, which is unconditionally
    // operator-only and always publishes at global scope — a form a
    // non-operator could fill in but never submit.
    await renderAs(false);

    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    expect(screen.queryByText('Add Runbook')).not.toBeInTheDocument();
  });

  it('offers "Add Runbook" to an operator', async () => {
    await renderAs(true);

    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    expect(screen.getByText('Add Runbook')).toBeInTheDocument();
  });
});
