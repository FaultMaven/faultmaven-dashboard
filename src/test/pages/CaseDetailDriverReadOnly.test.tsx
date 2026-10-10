import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * THE SECOND GUARD: `readOnly` on the dock and the Transcript tab's live arm.
 *
 * The layout rule already gives a reader who does not drive the case no panel
 * at all, so on the real page `readOnly` is unreachable for them. It is a
 * deliberately INDEPENDENT expression of the same fact (see `CaseTabs`): if an
 * input to the rule is ever wrong, a viewer must still not be handed a
 * writable composer on a case someone else drives. So this file makes the rule
 * wrong on purpose — it always answers "a composer here" — and asserts that
 * the panel is still opened read-only for anyone but the driver, and writable
 * for the driver.
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

// The rule, made wrong: it always believes the viewer drives the case.
vi.mock('../../lib/cases/conversationSurface', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/cases/conversationSurface')>();
  return {
    ...actual,
    resolveCaseConversationLayout: (
      input: Parameters<typeof actual.resolveCaseConversationLayout>[0],
    ) => actual.resolveCaseConversationLayout({ ...input, isDriver: true }),
  };
});

import CaseDetailPage from '../../pages/CaseDetailPage';
import { setViewport } from '../support/viewport';
import { resetChatSurfaceForTests } from '../../lib/copilot/chatSurfacePreference';
import { getCaseDetail, getDriverCandidates } from '../../lib/api';

const CASE = {
  case_id: 'case-1',
  title: 'Replica stopped accepting writes',
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

const HANDED_ON = { ...CASE, driver_id: 'u-grace', driver_display_name: 'Grace Hopper' };

async function renderPage(caseRow: typeof CASE) {
  vi.mocked(getCaseDetail).mockResolvedValue(caseRow as never);
  render(
    <MemoryRouter initialEntries={['/cases/case-1']}>
      <Routes>
        <Route path="/cases/:caseId" element={<CaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: CASE.title });
  await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());
  return screen.getByTestId('shared-copilot-ui');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetChatSurfaceForTests();
  fixtures.panel.mounts = 0;
  viewer.id = 'u-ada';
  vi.mocked(getDriverCandidates).mockResolvedValue([]);
});

describe('the dock\'s own readOnly is keyed on the DRIVER', () => {
  it('opens read-only for the creator who handed the case on', async () => {
    setViewport('wide');
    const panel = await renderPage(HANDED_ON);
    expect(screen.getByTestId('conversation-dock')).toContainElement(panel);
    expect(panel).toHaveAttribute('data-readonly', 'true');
  });

  it('opens writable for the driver', async () => {
    setViewport('wide');
    const panel = await renderPage(CASE);
    expect(panel).toHaveAttribute('data-readonly', 'false');
  });
});

describe('the Transcript tab\'s live arm readOnly is keyed on the DRIVER', () => {
  it('opens read-only for the creator who handed the case on', async () => {
    setViewport('narrow');
    const panel = await renderPage(HANDED_ON);
    expect(screen.getByTestId('transcript-tab-panel')).toContainElement(panel);
    expect(panel).toHaveAttribute('data-readonly', 'true');
  });

  it('opens writable for the driver', async () => {
    setViewport('narrow');
    const panel = await renderPage(CASE);
    expect(panel).toHaveAttribute('data-readonly', 'false');
  });
});
