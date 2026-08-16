import { render, screen, act, waitFor } from '@testing-library/react';
import type { CaseSummary } from '../../types/cases';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CaseListPage from '../../pages/CaseListPage';

// Shared mock setup (same pattern as App.test.tsx). The Dashboard is read-only
// for cases (D1) — there is no archive/mutation client to mock here.
vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  listCases: vi.fn(),
  searchCases: vi.fn(),
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
    clearAuthState: vi.fn(),
    isAuthenticated: true,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useNavigationItems', () => ({
  useNavigationItems: vi.fn().mockReturnValue([
    { label: 'Cases', path: '/cases', active: true },
    { label: 'Knowledge Base', path: '/kb', active: false },
  ]),
}));

import { listCases } from '../../lib/api';

const mockListCases = listCases as ReturnType<typeof vi.fn>;

const sampleCase: CaseSummary = {
  case_id: 'case-1',
  title: 'Database Outage',
  description: 'Primary DB is unresponsive',
  state: 'investigating' as const,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  last_activity_at: '2024-01-02T00:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'u1',
  organization_id: 'org1',
  current_turn: 5,
  source: 'copilot',
  stage: 'diagnosis',
  turns_without_progress: 0,
  is_terminal: false,
  shared_team_ids: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <CaseListPage />
    </MemoryRouter>
  );
}

describe('CaseListPage (read-only, D1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCases.mockResolvedValue({
      cases: [sampleCase],
      total_count: 1,
      page: 0,
      page_size: 20,
      has_more: false,
    });
  });

  it('renders the Cases heading', async () => {
    await act(async () => {
      renderPage();
    });

    expect(screen.getByRole('heading', { name: /^Cases$/i })).toBeInTheDocument();
  });

  it('shows case title as a link', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('Database Outage')).toBeInTheDocument();
    });
  });

  it('shows status badge for case', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      // Badge renders in a <span>, not a <button>. Filter chips are <button>s.
      const spans = screen.getAllByText('Investigating');
      const badge = spans.find((el) => el.tagName === 'SPAN');
      expect(badge).toBeInTheDocument();
    });
  });

  it('renders no case-mutation controls (no Archive button, no include-archived toggle)', async () => {
    const resolvedCase = { ...sampleCase, state: 'resolved' as const, is_terminal: true };
    mockListCases.mockResolvedValue({
      cases: [resolvedCase],
      total_count: 1,
      page: 0,
      page_size: 20,
      has_more: false,
    });

    await act(async () => {
      renderPage();
    });

    await waitFor(() => expect(screen.getByText('Database Outage')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/include archived/i)).not.toBeInTheDocument();
  });

  it('shows empty state when no cases', async () => {
    mockListCases.mockResolvedValue({ cases: [], total_count: 0, page: 0, page_size: 20, has_more: false });

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('No cases found.')).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    mockListCases.mockRejectedValue(new Error('API unreachable'));

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('API unreachable')).toBeInTheDocument();
    });
  });
});
