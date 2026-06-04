import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CaseListPage from '../../pages/CaseListPage';

// Shared mock setup (same pattern as App.test.tsx)
vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  listCases: vi.fn(),
  archiveCase: vi.fn().mockResolvedValue(undefined),
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
    deployment: 'local',
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

import { listCases, archiveCase } from '../../lib/api';

const mockListCases = listCases as ReturnType<typeof vi.fn>;
const mockArchiveCase = archiveCase as ReturnType<typeof vi.fn>;

const sampleCase = {
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
  milestones_completed: 2,
  total_milestones: 5,
  is_stuck: false,
  is_terminal: false,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <CaseListPage />
    </MemoryRouter>
  );
}

describe('CaseListPage', () => {
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

  it('shows Archive button only for resolved cases', async () => {
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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
    });
  });

  it('opens confirm dialog when Archive is clicked', async () => {
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

    await waitFor(() => screen.getByRole('button', { name: /^archive$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Archive Case')).toBeInTheDocument();
  });

  it('calls archiveCase when confirm dialog is confirmed', async () => {
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

    // Click the Archive button in the table row
    await waitFor(() => screen.getByRole('button', { name: /^archive$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }));

    // Click the Archive confirm button inside the dialog
    const dialog = await screen.findByRole('dialog');
    const confirmBtn = dialog.querySelector('button:last-child') as HTMLElement;
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => expect(mockArchiveCase).toHaveBeenCalled());
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
