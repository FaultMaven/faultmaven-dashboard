import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * WHOSE KNOWLEDGE BASE HOLDS A CASE'S RUNBOOK DRAFT (#262).
 *
 * Core files every case-generated draft in the case CREATOR's personal KB
 * (ADR-020 D6: `CaseConversionRequest.from_case(case, scope="personal")`, run
 * as the case's `user_id`), and `GET /knowledge/drafts` lists each user only
 * their own drafts and global ones. `GET /cases/{id}/reports` reports the
 * draft to every reader, so the Report tab's banner is seen by all of them,
 * and its "Open in KB" link is only any use to the creator: for the driver
 * or a teammate it opened a Drafts list that can never contain the draft.
 */

vi.mock('@faultmaven/copilot-ui', () => ({
  setHostStore: vi.fn(),
  setHostEndpoints: vi.fn(),
  setApiTransport: vi.fn(),
  clearApiTransport: vi.fn(),
  clearPersistedSession: vi.fn().mockResolvedValue(undefined),
  SessionSwitchedError: class SessionSwitchedError extends Error {},
  CredentialUnavailableError: class CredentialUnavailableError extends Error {},
  CopilotPanel: () => <div data-testid="shared-copilot-ui" />,
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
  getCaseReports: vi.fn(),
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
vi.mock('../../components/CaseDriverField', () => ({
  CaseDriverField: () => <span data-testid="case-driver-field-stub" />,
}));

import CaseDetailPage from '../../pages/CaseDetailPage';
import { setViewport } from '../support/viewport';
import { resetChatSurfaceForTests } from '../../lib/copilot/chatSurfacePreference';
import { getCaseDetail, getCaseReports } from '../../lib/api';

// A resolved case Ada created, shared with a team.
const CASE = {
  case_id: 'case-1',
  title: 'Redis outage',
  description: '',
  state: 'resolved' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-03T00:00:00Z',
  last_activity_at: '2026-01-03T00:00:00Z',
  resolved_at: '2026-01-03T00:00:00Z',
  closed_at: null,
  closure_reason: null,
  user_id: 'u-ada',
  creator_display_name: 'Ada Lovelace',
  driver_id: 'u-ada',
  driver_display_name: 'Ada Lovelace',
  enterprise_id: 'ent-1',
  current_turn: 4,
  source: 'copilot' as const,
  is_terminal: true,
  turns_without_progress: 0,
  current_stage: null,
  milestones_completed: [],
  pending_milestones: [],
  evidence_count: 0,
  hypothesis_count: 0,
  solution_count: 0,
  escalated: false,
  shared_team_ids: ['team-1'],
};

const SUMMARY = {
  report_id: 'rep-1',
  case_id: 'case-1',
  report_type: 'resolution_summary',
  title: 'Resolution summary for Redis outage',
  content: 'Raised maxmemory and the pages stopped.',
  format: 'markdown',
  generation_status: 'completed',
  generated_at: '2026-01-03T00:00:00Z',
  is_current: true,
  version: 1,
};

/** A runbook row as core projects a case-linked conversion draft into the reports list. */
function runbookRow(draftId: string) {
  return {
    report_id: draftId,
    case_id: 'case-1',
    report_type: 'runbook',
    title: 'Redis out of memory',
    content: '',
    format: 'markdown',
    generation_status: 'draft',
    generated_at: '2026-01-03T00:00:00Z',
    is_current: true,
    version: 1,
    draft_id: draftId,
    conversion_id: `conv-${draftId}`,
    runbook_id: 'redis-oom',
    scope: 'personal',
    knowledge_item_id: null,
  };
}

async function openReportTab(opts: { viewerId: string | null; driverId?: string; runbooks?: number }) {
  viewer.id = opts.viewerId;
  vi.mocked(getCaseDetail).mockResolvedValue({ ...CASE, driver_id: opts.driverId ?? CASE.driver_id } as never);
  const runbooks = Array.from({ length: opts.runbooks ?? 1 }, (_, i) => runbookRow(`draft-${i + 1}`));
  vi.mocked(getCaseReports).mockResolvedValue([SUMMARY, ...runbooks] as never);
  render(
    <MemoryRouter initialEntries={['/cases/case-1?tab=report']}>
      <Routes>
        <Route path="/cases/:caseId" element={<CaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  // The summary renders once the reports have loaded, and the banner with it.
  await screen.findByText('Raised maxmemory and the pages stopped.');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetChatSurfaceForTests();
  setViewport('wide');
});

describe('CaseDetailPage — the Report tab’s runbook banner', () => {
  it('links the creator to the case’s drafts in their Knowledge Base', async () => {
    await openReportTab({ viewerId: 'u-ada' });

    expect(screen.getByText('A runbook draft was generated from this case.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in KB/ })).toHaveAttribute('href', '/kb?tab=drafts&case=case-1');
    expect(screen.queryByText(/case creator's Knowledge Base/)).not.toBeInTheDocument();
  });

  it('tells the driver, who did not create the case, whose Knowledge Base holds it, with no link', async () => {
    await openReportTab({ viewerId: 'u-bob', driverId: 'u-bob' });

    expect(
      screen.getByText("A runbook draft was generated from this case. It is in the case creator's Knowledge Base."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open in KB/ })).not.toBeInTheDocument();
  });

  it('tells a teammate who only reads the case the same', async () => {
    await openReportTab({ viewerId: 'u-cy' });

    expect(screen.getByText(/It is in the case creator's Knowledge Base\./)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open in KB/ })).not.toBeInTheDocument();
  });

  it('counts several drafts, and says where they are', async () => {
    await openReportTab({ viewerId: 'u-cy', runbooks: 2 });

    expect(
      screen.getByText("2 runbook drafts were generated from this case. They are in the case creator's Knowledge Base."),
    ).toBeInTheDocument();
  });

  it('offers no link when the viewer is unknown (fails closed)', async () => {
    await openReportTab({ viewerId: null });

    expect(screen.getByText(/case creator's Knowledge Base/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open in KB/ })).not.toBeInTheDocument();
  });
});
