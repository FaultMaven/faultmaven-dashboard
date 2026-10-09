import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * THE CASE HEADER FOLLOWS THE DOCKED PANEL (faultmaven-dashboard#204).
 *
 * The panel has its own store and query client and nothing here reads them, so
 * the page learns that a case changed only from the panel's `onCaseChanged`
 * notification (faultmaven-copilot#320) and re-reads the case. The panel is a
 * stand-in that records the callback and a mount count; the page, the dock and
 * the badge are real.
 */

const fixtures = vi.hoisted(() => ({
  panel: { mounts: 0, onCaseChanged: undefined as undefined | ((id: string) => void) },
}));

vi.mock('@faultmaven/copilot-ui', async () => {
  const React = await import('react');
  function Stub({ onCaseChanged }: { onCaseChanged?: (id: string) => void }) {
    React.useState(() => {
      fixtures.panel.mounts += 1;
      return null;
    });
    fixtures.panel.onCaseChanged = onCaseChanged;
    return <div data-testid="shared-copilot-ui" />;
  }
  return {
    setHostStore: vi.fn(),
    setHostEndpoints: vi.fn(),
    setApiTransport: vi.fn(),
    clearApiTransport: vi.fn(),
    clearPersistedSession: vi.fn().mockResolvedValue(undefined),
    CopilotPanel: Stub,
  };
});

vi.mock('../../lib/api', () => ({
  getCaseDetail: vi.fn(),
  fetchCaseMarkdown: vi.fn(),
  logoutAuth: vi.fn(),
  getCaseMessages: vi.fn().mockResolvedValue({ messages: [], total_count: 0 }),
  getUploadedFiles: vi.fn().mockResolvedValue({ files: [] }),
  getUploadedFileDetails: vi.fn().mockResolvedValue(null),
  getCaseEvidenceList: vi.fn().mockResolvedValue({ evidence: [] }),
  getCaseUI: vi.fn().mockResolvedValue({ active_hypotheses: [] }),
}));

vi.mock('../../lib/auth/AuthManager', () => ({
  authManager: {
    getAccessToken: vi.fn().mockResolvedValue('tok-live'),
    peekAccessToken: vi.fn().mockResolvedValue('tok-live'),
    refreshTokens: vi.fn(),
    onAuthCleared: vi.fn().mockReturnValue(() => {}),
  },
}));

vi.mock('../../lib/auth/functions', () => ({
  getAccountProfile: vi.fn().mockResolvedValue({
    user_id: 'owner-1',
    username: 'ada',
    display_name: 'Ada L',
    email: 'ada@example.com',
    roles: ['user'],
    is_dev_user: false,
    created_at: '2026-01-01T00:00:00Z',
    organization: null,
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    authState: { user: { user_id: 'owner-1', username: 'ada', display_name: 'Ada L' } },
    deployment: 'standalone',
    role: 'individual',
    isAdmin: false,
    clearAuthState: vi.fn(),
    isAuthenticated: true,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../hooks/useTeamSharing', () => ({
  useTeamSharing: () => ({ enabled: false, teams: [], teamsById: {} }),
}));
vi.mock('../../hooks/useNavigationItems', () => ({
  useNavigationItems: () => [{ label: 'Cases', path: '/cases', active: false }],
}));
vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => ({ managementConsole: false, loading: false }),
}));

import CaseDetailPage from '../../pages/CaseDetailPage';
import { setViewport } from '../support/viewport';
import { getCaseDetail } from '../../lib/api';

const CASE = {
  case_id: 'case-1',
  title: 'Replica stopped accepting writes',
  description: 'Writes fail, reads succeed',
  state: 'investigating' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  last_activity_at: '2026-01-02T00:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'owner-1',
  enterprise_id: 'ent-1',
  current_turn: 1,
  source: 'copilot' as const,
  is_terminal: false,
  turns_without_progress: 0,
  current_stage: null,
  milestones_completed: [],
  pending_milestones: [],
  evidence_count: 0,
  hypothesis_count: 0,
  solution_count: 0,
  escalated: false,
  shared_team_ids: [],
};
const RESOLVED = { ...CASE, state: 'resolved' as const, is_terminal: true, current_turn: 4 };

async function renderPage() {
  vi.mocked(getCaseDetail).mockResolvedValue(CASE as never);
  render(
    <MemoryRouter initialEntries={['/cases/case-1']}>
      <Routes>
        <Route path="/cases/:caseId" element={<CaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: CASE.title });
  await waitFor(() => expect(fixtures.panel.onCaseChanged).toBeTypeOf('function'));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  fixtures.panel.mounts = 0;
  fixtures.panel.onCaseChanged = undefined;
  setViewport('wide');
});

describe('the case header follows the docked panel', () => {
  it('re-reads the case on a notification for its own id, and the badge updates', async () => {
    await renderPage();
    expect(vi.mocked(getCaseDetail)).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Investigating')).toBeInTheDocument();
    expect(screen.getByText('1 turn')).toBeInTheDocument();

    vi.mocked(getCaseDetail).mockResolvedValue(RESOLVED as never);
    act(() => fixtures.panel.onCaseChanged!('case-1'));

    await waitFor(() => expect(vi.mocked(getCaseDetail)).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Resolved')).toBeInTheDocument());
    expect(screen.queryByText('Investigating')).not.toBeInTheDocument();
    expect(screen.getByText('4 turns')).toBeInTheDocument();
  });

  it('does not re-read for an id that is not this page\'s case', async () => {
    await renderPage();
    act(() => fixtures.panel.onCaseChanged!('case-other'));
    await Promise.resolve();
    expect(vi.mocked(getCaseDetail)).toHaveBeenCalledTimes(1);
  });

  it('refreshes without unmounting the dock or the panel', async () => {
    await renderPage();
    expect(fixtures.panel.mounts).toBe(1);

    // Hold the refresh open: a spinner-driven reload would swap the page body
    // for the loading view right here.
    let release!: (v: unknown) => void;
    vi.mocked(getCaseDetail).mockReturnValue(new Promise((r) => (release = r)) as never);
    act(() => fixtures.panel.onCaseChanged!('case-1'));
    expect(screen.getByTestId('conversation-dock')).toBeInTheDocument();
    expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument();

    await act(async () => release(RESOLVED));
    await waitFor(() => expect(screen.getByText('Resolved')).toBeInTheDocument());
    expect(screen.getByTestId('conversation-dock')).toBeInTheDocument();
    expect(fixtures.panel.mounts).toBe(1);
  });

  it('reaches the header from the narrow-width Transcript arm too', async () => {
    setViewport('narrow');
    await renderPage();
    expect(screen.queryByTestId('conversation-dock')).not.toBeInTheDocument();

    vi.mocked(getCaseDetail).mockResolvedValue(RESOLVED as never);
    act(() => fixtures.panel.onCaseChanged!('case-1'));
    await waitFor(() => expect(screen.getByText('Resolved')).toBeInTheDocument());
  });
});
