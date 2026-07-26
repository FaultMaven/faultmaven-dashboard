import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AdminCaseListPage from '../../pages/AdminCaseListPage';

vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  getAdminCases: vi.fn(),
  authManager: {
    getAuthState: vi.fn().mockResolvedValue(null),
    saveAuthState: vi.fn(),
    clearAuthState: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue(null),
  },
  config: { apiUrl: 'http://localhost:8090' },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({
    deployment: 'standalone',
    role: 'individual',
    isAdmin: true,
    clearAuthState: vi.fn(),
    isAuthenticated: true,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useNavigationItems', () => ({
  useNavigationItems: vi.fn().mockReturnValue([
    { label: 'Cases', path: '/cases', active: false },
    { label: 'All Cases', path: '/admin/cases', active: true },
  ]),
}));

import { getAdminCases } from '../../lib/api';

const mockGetAdminCases = getAdminCases as ReturnType<typeof vi.fn>;

const copilotCase = {
  case_id: 'case-copilot',
  title: 'Copilot Case',
  description: 'from a copilot user',
  state: 'investigating' as const,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  last_activity_at: '2024-01-02T00:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'copilot_user',
  organization_id: 'org1',
  current_turn: 3,
  milestones_completed: 1,
  total_milestones: 8,
  is_terminal: false,
  source: 'copilot' as const,
};

const slackCase = {
  ...copilotCase,
  case_id: 'case-slack',
  title: 'Slack Case',
  description: 'from the slack agent',
  user_id: 'slack-agent',
  source: 'slack' as const,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminCaseListPage />
    </MemoryRouter>
  );
}

/** The cloud (ADR-012 D9) row: no `title`/`description` keys at all. */
const metadataCase = {
  case_id: 'case-cloud-1',
  state: 'investigating' as const,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  last_activity_at: '2024-01-02T00:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'tenant_user',
  organization_id: 'org-acme',
  current_turn: 3,
  milestones_completed: 1,
  total_milestones: 8,
  is_terminal: false,
  source: 'copilot' as const,
};

describe('AdminCaseListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminCases.mockResolvedValue({
      view: 'full',
      cases: [copilotCase, slackCase],
      total_count: 2,
      has_more: false,
    });
  });

  it('renders the All Cases heading', async () => {
    await act(async () => {
      renderPage();
    });

    expect(screen.getByRole('heading', { name: /^All Cases$/i })).toBeInTheDocument();
  });

  it('shows cases from different owners (Copilot and Slack)', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Copilot Case')).toBeInTheDocument();
      expect(screen.getByText('Slack Case')).toBeInTheDocument();
    });
    // Owner column surfaces the underlying user identity, incl. the slack agent.
    expect(screen.getByText('slack-agent')).toBeInTheDocument();
    expect(screen.getByText('copilot_user')).toBeInTheDocument();
  });

  it('renders state filters only — no search control the endpoint ignores', async () => {
    await act(async () => {
      renderPage();
    });

    // State chips are present…
    expect(screen.getByRole('button', { name: 'Investigating' })).toBeInTheDocument();
    // …but the search input (unsupported by the admin endpoint) is hidden by stateOnly.
    expect(screen.queryByLabelText('Search cases')).not.toBeInTheDocument();
  });

  it('shows a Slack source badge on Slack cases', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => screen.getByText('Slack Case'));
    // "Slack" appears both as a filter chip (button) and the row badge (span).
    const slackTexts = screen.getAllByText('Slack');
    expect(slackTexts.some((el) => el.tagName === 'SPAN')).toBe(true);
  });

  it('filters by source when the Slack chip is clicked', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => screen.getByText('Slack Case'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Slack' }));
    });
    await waitFor(() =>
      expect(mockGetAdminCases).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'slack' }),
        0,
        20
      )
    );
  });

  it('shows empty state when no cases', async () => {
    mockGetAdminCases.mockResolvedValue({
      view: 'full',
      cases: [],
      total_count: 0,
      has_more: false,
    });

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('No cases found.')).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    mockGetAdminCases.mockRejectedValue(new Error('API unreachable'));

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('API unreachable')).toBeInTheDocument();
    });
  });

  it('shows a refusal message INSTEAD of an empty table (multi-tenant 403)', async () => {
    // The backend refuses the cross-tenant list under TENANT_PROVIDER=multi
    // because RLS would scope it to one org and make it silently partial. An
    // empty table would read as "no cases exist" — precisely the wrong answer
    // that refusal exists to prevent — so the page must not render one.
    const detail =
      'Cross-tenant case listing is not available under multi-tenant cloud: ' +
      'row-level security would scope the result to a single organization, so ' +
      'the list would be silently partial (ADR-012 D9).';
    mockGetAdminCases.mockRejectedValue(new Error(detail));

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText(detail)).toBeInTheDocument();
    });
    expect(screen.queryByText('No cases found.')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // …and no count either: the load never happened, so "0 cases" would assert
    // something the page does not know.
    expect(screen.queryByText(/0 cases/)).not.toBeInTheDocument();
  });

  describe('cloud metadata view (ADR-012 D9)', () => {
    beforeEach(() => {
      mockGetAdminCases.mockResolvedValue({
        view: 'metadata',
        cases: [metadataCase],
        total_count: 1,
        has_more: false,
      });
    });

    it('renders metadata columns and no Title column', async () => {
      await act(async () => {
        renderPage();
      });

      await waitFor(() => {
        expect(screen.getByText('case-cloud-1')).toBeInTheDocument();
      });
      expect(screen.getByRole('columnheader', { name: 'Case ID' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Organization' })).toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: 'Title' })).not.toBeInTheDocument();
      // The metadata that IS ambient still renders.
      expect(screen.getByText('tenant_user')).toBeInTheDocument();
      expect(screen.getByText('org-acme')).toBeInTheDocument();
    });

    it('offers no content-open link — the ambient list has no content path', async () => {
      // `GET /cases/{id}` is owner-∪-shared scoped with no operator bypass, so
      // linking each row would land the operator on 404 "Case not found or
      // access denied" for a case they can see listed right here. The open-
      // content affordance arrives with break-glass (faultmaven#815).
      await act(async () => {
        renderPage();
      });

      await waitFor(() => screen.getByText('case-cloud-1'));
      expect(screen.queryByRole('link', { name: /case-cloud-1/ })).not.toBeInTheDocument();
      expect(document.querySelector('a[href*="case-cloud-1"]')).toBeNull();
    });

    it('tells the operator the omission is policy, not missing data', async () => {
      await act(async () => {
        renderPage();
      });

      await waitFor(() => screen.getByText('case-cloud-1'));
      expect(screen.getByText(/Metadata only/i)).toBeInTheDocument();
      // …and never the placeholder that would misreport a withheld title as an
      // absent one.
      expect(screen.queryByText('Untitled Case')).not.toBeInTheDocument();
    });

    it('cannot surface content even if the response carries it', async () => {
      // The guarantee is that the metadata render path has no way to display
      // content — not merely that the backend currently omits it. Feed the
      // arm content anyway (a backend regression, a proxy replaying an old
      // shape) and it must still not reach the screen.
      mockGetAdminCases.mockResolvedValue({
        view: 'metadata',
        cases: [
          {
            ...metadataCase,
            title: 'payments DB down for ACME',
            description: 'customer-visible outage since 02:00',
          },
        ],
        total_count: 1,
        has_more: false,
      });

      await act(async () => {
        renderPage();
      });

      await waitFor(() => screen.getByText('case-cloud-1'));
      expect(screen.queryByText('payments DB down for ACME')).not.toBeInTheDocument();
      expect(screen.queryByText('customer-visible outage since 02:00')).not.toBeInTheDocument();
    });

    it('renders the full table with titles when the response says view=full', async () => {
      // The same page, same deployment-agnostic code path — only the
      // discriminator differs. This is what keeps columns tied to the served
      // policy rather than to the app's guess at the deployment mode.
      mockGetAdminCases.mockResolvedValue({
        view: 'full',
        cases: [copilotCase],
        total_count: 1,
        has_more: false,
      });

      await act(async () => {
        renderPage();
      });

      await waitFor(() => expect(screen.getByText('Copilot Case')).toBeInTheDocument());
      expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument();
      expect(screen.queryByText(/Metadata only/i)).not.toBeInTheDocument();
    });
  });
});
