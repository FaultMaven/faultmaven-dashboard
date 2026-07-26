import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminCaseContentPage from '../../pages/AdminCaseContentPage';

/**
 * Operator break-glass content view (ADR-012 D9, faultmaven#815 / #62).
 *
 * The guarantees under test are the acceptance criteria of the issue, phrased
 * as the UI can actually hold them:
 *
 * 1. No content is on screen without a successful, authorised read. Because
 *    content only ever arrives inside a 200, this is structural — but a page
 *    that kept stale content after a refusal would break it, so that is pinned.
 * 2. A refusal is shown as a refusal, with the way out (request access).
 * 3. How the read was authorised is taken from the response's discriminator,
 *    never from the app's notion of the deployment.
 * 4. Nothing here routes into the owner-scoped `/cases/{id}` (faultmaven#846).
 */

vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  authManager: {
    getAuthState: vi.fn().mockResolvedValue(null),
    getAccessToken: vi.fn().mockResolvedValue(null),
  },
  config: { apiUrl: 'http://localhost:8090' },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({
    deployment: 'cloud',
    role: 'platform_admin',
    isAdmin: true,
    clearAuthState: vi.fn(),
    isAuthenticated: true,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useNavigationItems', () => ({
  useNavigationItems: vi.fn().mockReturnValue([]),
}));

vi.mock('../../lib/breakGlass/api', () => ({
  openAdminCaseContent: vi.fn(),
  openAdminCaseTranscript: vi.fn(),
  revokeBreakGlassGrant: vi.fn(),
  requestBreakGlassGrant: vi.fn(),
}));

import {
  openAdminCaseContent,
  openAdminCaseTranscript,
  revokeBreakGlassGrant,
  requestBreakGlassGrant,
} from '../../lib/breakGlass/api';

const mockOpen = openAdminCaseContent as ReturnType<typeof vi.fn>;
const mockTranscript = openAdminCaseTranscript as ReturnType<typeof vi.fn>;
const mockRevoke = revokeBreakGlassGrant as ReturnType<typeof vi.fn>;
const mockRequest = requestBreakGlassGrant as ReturnType<typeof vi.fn>;

const CASE_ID = 'case_a1b2c3d4e5f6';
const SECRET_TITLE = 'payments API 5xx spike';

const caseDetail = {
  case_id: CASE_ID,
  title: SECRET_TITLE,
  description: 'content an operator must not see without a grant',
  state: 'investigating' as const,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
  last_activity_at: '2026-07-02T00:00:00Z',
  user_id: 'tenant-user-9',
  organization_id: 'org-acme',
  current_turn: 3,
  milestones_completed: 1,
  total_milestones: 8,
  is_terminal: false,
};

const liveGrant = {
  grant_id: 'grant-1',
  operator_user_id: 'op-1',
  operator_username: 'operator@example.com',
  target_case_id: CASE_ID,
  target_organization_id: 'org-acme',
  reason: 'customer reports the investigation is stuck; ticket SUP-4821',
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 45 * 60_000).toISOString(),
  revoked_at: null,
  revoked_by: null,
  approval_state: 'auto_approved',
  is_live: true,
  deployment_mode: 'cloud',
};

const emptyTranscript = {
  access: 'break_glass' as const,
  grant: liveGrant,
  messages: { messages: [], total_count: 0, retrieved_count: 0, has_more: false },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/admin/cases/${CASE_ID}?org=org-acme`]}>
      <Routes>
        <Route path="/admin/cases/:caseId" element={<AdminCaseContentPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminCaseContentPage — refused without a grant', () => {
  beforeEach(() => {
    mockOpen.mockRejectedValue(
      new Error('Reading case content in cloud requires a live break-glass grant for this case.')
    );
  });

  it('shows the refusal and no content whatsoever', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => screen.getByText(/requires a live break-glass grant/i));
    expect(screen.queryByText(SECRET_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByText(/content an operator must not see/)).not.toBeInTheDocument();
  });

  it('does not fetch the transcript once the content read was refused', async () => {
    // One refusal, not two: the gate is the same for both surfaces, so a failed
    // open has already answered the question for the transcript.
    await act(async () => {
      renderPage();
    });

    await waitFor(() => screen.getByText(/requires a live break-glass grant/i));
    expect(mockTranscript).not.toHaveBeenCalled();
  });

  it('offers a way to request access', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => screen.getByRole('button', { name: /Request access/i }));
    expect(screen.getByRole('button', { name: /Request access/i })).toBeEnabled();
  });

  it('re-opens the case once a grant is obtained', async () => {
    mockRequest.mockResolvedValue(liveGrant);

    await act(async () => {
      renderPage();
    });
    await waitFor(() => screen.getByRole('button', { name: /Request access/i }));

    fireEvent.click(screen.getByRole('button', { name: /Request access/i }));
    fireEvent.change(screen.getByLabelText(/Why do you need this/i), {
      target: { value: 'customer reports the investigation is stuck; SUP-4821' },
    });

    // The open now succeeds, as it would once the grant exists.
    mockOpen.mockResolvedValue({ access: 'break_glass', grant: liveGrant, case: caseDetail });
    mockTranscript.mockResolvedValue(emptyTranscript);

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Request access/i }).slice(-1)[0]);
    });

    await waitFor(() => expect(screen.getByText(SECRET_TITLE)).toBeInTheDocument());
  });
});

describe('AdminCaseContentPage — opened under a live grant', () => {
  beforeEach(() => {
    mockOpen.mockResolvedValue({ access: 'break_glass', grant: liveGrant, case: caseDetail });
    mockTranscript.mockResolvedValue(emptyTranscript);
  });

  it('renders the content', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => expect(screen.getByText(SECRET_TITLE)).toBeInTheDocument());
  });

  it('names the grant, its reason and its remaining window', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => screen.getByText(/Break-glass access/i));
    expect(screen.getByText(/expires in 4[45] min/i)).toBeInTheDocument();
    expect(screen.getByText(/ticket SUP-4821/)).toBeInTheDocument();
  });

  it('says the read is recorded permanently', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => screen.getByText(/recorded permanently/i));
  });

  it('takes the content off screen when the grant is ended early', async () => {
    // Revocation must actually withdraw the content, not leave it visible under
    // a changed banner — the banner is not the control, the reload is.
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.getByText(SECRET_TITLE)).toBeInTheDocument());

    mockRevoke.mockResolvedValue({ ...liveGrant, is_live: false });
    mockOpen.mockRejectedValue(new Error('requires a live break-glass grant'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /End access now/i }));
    });

    await waitFor(() => expect(screen.queryByText(SECRET_TITLE)).not.toBeInTheDocument());
  });

  it('takes the content off screen when the window lapses', async () => {
    // A break-glass window is minutes long and a page left open outlives it
    // easily. Without a ticker the banner would keep asserting the original
    // remaining time with the content still displayed — the UI claiming an
    // authorisation that expired. The timer does not enforce anything; it
    // decides when to ask the gate again, and the gate refuses.
    vi.useFakeTimers();
    try {
      const shortGrant = {
        ...liveGrant,
        expires_at: new Date(Date.now() + 30_000).toISOString(),
      };
      mockOpen.mockResolvedValue({ access: 'break_glass', grant: shortGrant, case: caseDetail });
      mockTranscript.mockResolvedValue({ ...emptyTranscript, grant: shortGrant });

      await act(async () => {
        renderPage();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText(SECRET_TITLE)).toBeInTheDocument();

      // The window closes, and the reload it triggers is refused.
      mockOpen.mockRejectedValue(new Error('requires a live break-glass grant'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(45_000);
      });

      expect(screen.queryByText(SECRET_TITLE)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never routes into the owner-scoped case page', async () => {
    // `GET /cases/{id}` has no operator arm; a link there would 404 for every
    // case the operator does not own (faultmaven#846).
    await act(async () => {
      renderPage();
    });

    await waitFor(() => expect(screen.getByText(SECRET_TITLE)).toBeInTheDocument());
    expect(document.querySelector('a[href^="/cases/"]')).toBeNull();
  });
});

describe('AdminCaseContentPage — standing access (standalone)', () => {
  beforeEach(() => {
    mockOpen.mockResolvedValue({ access: 'standing', grant: null, case: caseDetail });
    mockTranscript.mockResolvedValue({
      access: 'standing',
      grant: null,
      messages: { messages: [], total_count: 0, retrieved_count: 0, has_more: false },
    });
  });

  it('serves the content and says only that the read is recorded', async () => {
    // The banner is driven by the response's `access` discriminator, NOT by the
    // deployment — note that `useAuth` is mocked to 'cloud' throughout this
    // file. A page that inferred the posture from the deployment would show
    // break-glass wording here, for a read that consumed no grant.
    await act(async () => {
      renderPage();
    });

    await waitFor(() => expect(screen.getByText(SECRET_TITLE)).toBeInTheDocument());
    expect(screen.getByText(/recorded in the operator access trail/i)).toBeInTheDocument();
    expect(screen.queryByText(/Break-glass access/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /End access now/i })).not.toBeInTheDocument();
  });
});
