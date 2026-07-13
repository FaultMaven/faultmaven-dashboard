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
  is_stuck: false,
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

describe('AdminCaseListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminCases.mockResolvedValue({
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

  it('renders state filters only — no date/search controls the endpoint ignores', async () => {
    await act(async () => {
      renderPage();
    });

    // State chips are present…
    expect(screen.getByRole('button', { name: 'Investigating' })).toBeInTheDocument();
    // …but the date-range and search inputs (unsupported by the admin endpoint) are not.
    expect(screen.queryByLabelText('Search cases')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('From date')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('To date')).not.toBeInTheDocument();
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
    mockGetAdminCases.mockResolvedValue({ cases: [], total_count: 0, has_more: false });

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
});
