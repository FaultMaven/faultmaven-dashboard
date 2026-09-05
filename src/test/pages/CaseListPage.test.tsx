import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import type { CaseSummary } from '../../types/cases';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CaseListPage from '../../pages/CaseListPage';

// Shared mock setup (same pattern as App.test.tsx). The Dashboard is read-only
// for cases (D1) — there is no archive/mutation client to mock here.
vi.mock('../../lib/api', async () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  listCases: vi.fn(),
  searchCases: vi.fn(),
  authManager: (await import('../support/authFixtures')).makeAuthManagerMock(),
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

/**
 * Rendered inside the routes it can navigate to, so a redirect is OBSERVABLE.
 * A bare `<CaseListPage />` under MemoryRouter renders `<Navigate>` as nothing
 * at all, and "the panel opened instead of an empty list" would be
 * indistinguishable from "the page rendered nothing".
 */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/cases']}>
      <Routes>
        <Route path="/cases" element={<CaseListPage />} />
        <Route path="/investigate" element={<div data-testid="investigate-page">panel</div>} />
      </Routes>
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

  it('stays on /cases and offers the panel when the account has no cases', async () => {
    // `/cases` is an ORDINARY PAGE again. It used to redirect to /investigate
    // whenever the rows in hand were empty, which made the route unreachable
    // for the very person it was meant to help and bounced anyone who paged
    // past the end or cleared a filter — `cases.length` cannot tell those
    // apart. The first-run question is asked once, at sign-in, by
    // `resolvePostSignInLanding()`.
    mockListCases.mockResolvedValue({ cases: [], total_count: 0, page: 0, page_size: 20, has_more: false });

    await act(async () => { renderPage(); });

    await waitFor(() => expect(screen.getByTestId('cases-empty-state')).toBeInTheDocument());
    expect(screen.queryByTestId('investigate-page')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Cases$/i })).toBeInTheDocument();
    expect(screen.getByText(/no cases yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /start an investigation/i }).getAttribute('href'),
    ).toBe('/investigate');
  });

  it('does not bounce a user who paged PAST THE END of their cases', async () => {
    // An empty page of a non-empty account. The redirect keyed on
    // `cases.length` sent this person to a new investigation and hid the cases
    // they actually have; `total_count` is what distinguishes the two.
    mockListCases.mockResolvedValue({ cases: [], total_count: 42, page: 9, page_size: 20, has_more: false });

    await act(async () => { renderPage(); });

    await waitFor(() => expect(screen.getByTestId('cases-empty-state')).toBeInTheDocument());
    expect(screen.queryByTestId('investigate-page')).not.toBeInTheDocument();
    // It says "nothing matched", not "you have no cases".
    expect(screen.getByText(/no cases match these filters/i)).toBeInTheDocument();
    expect(screen.queryByText(/no cases yet/i)).not.toBeInTheDocument();
  });

  it('does not bounce a user who CLEARED a filter down to nothing', async () => {
    await act(async () => { renderPage(); });
    await waitFor(() => expect(screen.getByText('Database Outage')).toBeInTheDocument());

    mockListCases.mockResolvedValue({ cases: [], total_count: 0, page: 0, page_size: 20, has_more: false });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Resolved$/i }));
    });

    await waitFor(() => expect(screen.getByTestId('cases-empty-state')).toBeInTheDocument());
    expect(screen.queryByTestId('investigate-page')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /start an investigation/i }).getAttribute('href'),
    ).toBe('/investigate');
  });

  it('does NOT redirect away from a failed load', async () => {
    // A failed load also leaves `cases` empty. Bouncing the user to the panel
    // would hide the reason their cases are missing and look like data loss.
    mockListCases.mockRejectedValue(new Error('API unreachable'));

    await act(async () => {
      renderPage();
    });

    await waitFor(() => expect(screen.getByText('API unreachable')).toBeInTheDocument());
    expect(screen.queryByTestId('investigate-page')).not.toBeInTheDocument();
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
