import { useEffect } from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

/**
 * THE PAGE'S OWN GUARD on a hand-off answer for a case it no longer shows.
 *
 * `CaseDriverField` drops an answer that lands after it unmounted; the page
 * ALSO refuses one that names a case other than the route's. This file stubs
 * the field and keeps the callbacks it was handed for case-1, so only the
 * page's check stands between a late answer and a re-read of case-1 under
 * /cases/case-2.
 */

const fixtures = vi.hoisted(() => ({
  panel: { mounts: 0 },
}));

vi.mock('@faultmaven/copilot-ui', () => ({
  setHostStore: vi.fn(),
  setHostEndpoints: vi.fn(),
  setApiTransport: vi.fn(),
  clearApiTransport: vi.fn(),
  clearPersistedSession: vi.fn().mockResolvedValue(undefined),
  CopilotPanel: ({ initialCase }: { initialCase?: { caseId?: string; readOnly?: boolean } }) => {
    fixtures.panel.mounts += 1;
    return (
      <div
        data-testid="shared-copilot-ui"
        data-case={initialCase?.caseId ?? ''}
        data-readonly={String(initialCase?.readOnly ?? '')}
      />
    );
  },
}));

vi.mock('../../lib/api', () => ({
  getCaseDetail: vi.fn(),
  fetchCaseMarkdown: vi.fn(),
  logoutAuth: vi.fn(),
  getCaseMessages: vi.fn().mockResolvedValue({ messages: [], total_count: 0 }),
  getUploadedFiles: vi.fn().mockResolvedValue({ files: [] }),
  getUploadedFileDetails: vi.fn().mockResolvedValue(null),
  getCaseEvidenceList: vi.fn().mockResolvedValue({ evidence: [] }),
  getCaseUI: vi.fn().mockResolvedValue({ active_hypotheses: [] }),
  getCaseReports: vi.fn().mockResolvedValue([]),
  getCaseReportDownloadUrl: vi.fn(),
  getDriverCandidates: vi.fn(),
  reassignCaseDriver: vi.fn(),
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
    user_id: 'u-ada',
    username: 'ada',
    display_name: 'Ada L',
    email: 'ada@example.com',
    roles: ['user'],
    is_dev_user: false,
    created_at: '2026-01-01T00:00:00Z',
    organization: null,
  }),
}));

const viewer: { id: string | null } = { id: 'u-ada' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    authState: viewer.id ? { user: { user_id: viewer.id, username: 'x', display_name: 'X' } } : null,
    deployment: 'cloud',
    role: 'individual',
    isAdmin: false,
    clearAuthState: vi.fn(),
    isAuthenticated: true,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useTeamSharing', () => ({
  useTeamSharing: () => ({ enabled: true, teams: [], teamsById: new Map() }),
}));
vi.mock('../../hooks/useNavigationItems', () => ({
  useNavigationItems: () => [{ label: 'Cases', path: '/cases', active: false }],
}));
vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => ({ managementConsole: false, loading: false }),
}));

// The field, stubbed: record the callbacks each render hands it.
const captured = vi.hoisted(() => ({
  calls: [] as {
    caseId: string;
    onReassigned: (row: { case_id: string; driver_id?: string | null }) => void;
    onCaseStale: (caseId: string) => void;
  }[],
}));
vi.mock('../../components/CaseDriverField', () => ({
  CaseDriverField: (props: (typeof captured.calls)[number]) => {
    captured.calls.push(props);
    return <span data-testid="case-driver-field-stub" />;
  },
}));

import CaseDetailPage from '../../pages/CaseDetailPage';
import { setViewport } from '../support/viewport';
import { resetChatSurfaceForTests } from '../../lib/copilot/chatSurfacePreference';
import { getCaseDetail } from '../../lib/api';

const CASE = {
  case_id: 'case-1',
  title: 'First case',
  description: '',
  state: 'investigating' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  last_activity_at: '2026-01-02T00:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'u-ada',
  creator_display_name: 'Ada Lovelace',
  driver_id: 'u-ada',
  driver_display_name: 'Ada Lovelace',
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
const CASE2 = { ...CASE, case_id: 'case-2', title: 'Second case' };

const nav: { go?: (to: string) => void } = {};
function NavGrab() {
  const navigate = useNavigate();
  useEffect(() => {
    nav.go = navigate;
  }, [navigate]);
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetChatSurfaceForTests();
  captured.calls = [];
  viewer.id = 'u-ada';
  setViewport('wide');
  vi.mocked(getCaseDetail).mockImplementation(
    async (id: string) => (id === 'case-2' ? CASE2 : CASE) as never,
  );
});

/** Opens case-1, keeps the callbacks its field got, then moves to case-2. */
async function openCase1ThenMoveToCase2() {
  render(
    <MemoryRouter initialEntries={['/cases/case-1']}>
      <NavGrab />
      <Routes>
        <Route path="/cases/:caseId" element={<CaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'First case' });
  const case1 = captured.calls.filter((c) => c.caseId === 'case-1').at(-1);
  expect(case1).toBeDefined();

  await act(async () => {
    nav.go?.('/cases/case-2');
  });
  await screen.findByRole('heading', { name: 'Second case' });
  vi.mocked(getCaseDetail).mockClear();
  return case1!;
}

describe('a late hand-off answer for case-1, on /cases/case-2', () => {
  it('success: is ignored — case-1 is not re-read and nothing is applied', async () => {
    const case1 = await openCase1ThenMoveToCase2();

    await act(async () => {
      case1.onReassigned({ case_id: 'case-1', driver_id: 'u-grace' });
    });

    expect(getCaseDetail).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Second case' })).toBeInTheDocument();
    expect(screen.getByTestId('shared-copilot-ui')).toHaveAttribute('data-case', 'case-2');
  });

  it('stale notice: is ignored — case-1 is not re-read under this URL', async () => {
    const case1 = await openCase1ThenMoveToCase2();

    await act(async () => {
      case1.onCaseStale('case-1');
    });

    expect(getCaseDetail).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Second case' })).toBeInTheDocument();
  });

  it('while still on case-1, the same answers ARE acted on', async () => {
    render(
      <MemoryRouter initialEntries={['/cases/case-1']}>
        <Routes>
          <Route path="/cases/:caseId" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'First case' });
    const case1 = captured.calls.at(-1)!;
    vi.mocked(getCaseDetail).mockClear();

    await act(async () => {
      case1.onCaseStale('case-1');
    });
    expect(getCaseDetail).toHaveBeenCalledWith('case-1');
  });
});
