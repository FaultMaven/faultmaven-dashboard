import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * THE CASE DRIVER ON THE CASE PAGE (ADR-020, faultmaven#1898).
 *
 * A case has a creator (`user_id`) and one driver (`driver_id`, always the
 * EFFECTIVE driver on the wire). Every reader views it; the driver writes it;
 * the creator governs it. This page asks three separate questions and each
 * has its own answer:
 *
 * - is there a composer here?            → is the viewer the DRIVER
 * - is there a Share button?             → is the viewer the CREATOR
 * - is there a "Change driver" control?  → creator OR driver, AND more than one
 *                                          candidate to choose from
 *
 * Every fixture below separates the creator from the driver, so a rule that
 * keys on the wrong one fails here rather than passing by coincidence.
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

import CaseDetailPage from '../../pages/CaseDetailPage';
import { setViewport } from '../support/viewport';
import { resetChatSurfaceForTests } from '../../lib/copilot/chatSurfacePreference';
import { getCaseDetail, getDriverCandidates, reassignCaseDriver } from '../../lib/api';
import { APIError } from '../../lib/knowledge/errors';

/** Ada created the case; who drives it varies per test. */
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
  shared_team_ids: ['team-sre'],
};

const ADA = { user_id: 'u-ada', display_name: 'Ada Lovelace' };
const GRACE = { user_id: 'u-grace', display_name: 'Grace Hopper' };
const LINUS = { user_id: 'u-linus', display_name: 'Linus T' };

/** A case row as the server might send it — any field may be absent or null. */
type CaseFixture = { [K in keyof typeof CASE]?: (typeof CASE)[K] | null };

async function renderPage(caseRow: CaseFixture = CASE) {
  vi.mocked(getCaseDetail).mockResolvedValue(caseRow as never);
  const result = render(
    <MemoryRouter initialEntries={['/cases/case-1']}>
      <Routes>
        <Route path="/cases/:caseId" element={<CaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: CASE.title });
  return result;
}

/** Where a composer is, if anywhere. */
function composerShown(): boolean {
  return !!screen.queryByTestId('shared-copilot-ui') || !!screen.queryByTestId('case-panel-holder');
}

const changeDriverButton = () => screen.queryByRole('button', { name: /change driver/i });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetChatSurfaceForTests();
  fixtures.panel.mounts = 0;
  viewer.id = 'u-ada';
  setViewport('wide');
  vi.mocked(getDriverCandidates).mockResolvedValue([ADA, GRACE, LINUS]);
});

describe('the meta row names the creator and the driver', () => {
  it('shows both by display name', async () => {
    await renderPage({ ...CASE, driver_id: 'u-grace', driver_display_name: 'Grace Hopper' });

    expect(screen.getByTestId('case-creator')).toHaveTextContent('Creator Ada Lovelace');
    expect(screen.getByTestId('case-driver-name')).toHaveTextContent('Grace Hopper');
  });

  it('falls back to a short id only when the server sent no name', async () => {
    await renderPage({
      ...CASE,
      creator_display_name: null,
      driver_id: 'u-grace-0123456789',
      driver_display_name: null,
    });

    expect(screen.getByTestId('case-creator')).toHaveTextContent('Creator u-ada');
    const driver = within(screen.getByTestId('case-driver-name')).getByText('u-grace-');
    expect(driver).toHaveAttribute('title', 'u-grace-0123456789');
  });
});

describe('a composer is the DRIVER\'s (isDriver gates dock, tabs and layout)', () => {
  it('viewer drives (and created) the case — the dock carries a live panel', async () => {
    await renderPage();

    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());
    expect(screen.getByTestId('conversation-dock')).toBeInTheDocument();
    expect(screen.getByTestId('shared-copilot-ui')).toHaveAttribute('data-readonly', 'false');
    expect(screen.getByTestId('case-detail-root').className).toContain('h-dvh');
  });

  it('viewer drives a case someone else created — the dock is theirs', async () => {
    viewer.id = 'u-grace';
    await renderPage({ ...CASE, driver_id: 'u-grace', driver_display_name: 'Grace Hopper' });

    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());
    expect(screen.getByTestId('shared-copilot-ui')).toHaveAttribute('data-readonly', 'false');
  });

  it('creator who handed it on — the record, no dock, no composer', async () => {
    await renderPage({ ...CASE, driver_id: 'u-grace', driver_display_name: 'Grace Hopper' });

    await waitFor(() => expect(screen.getByTestId('transcript-record')).toBeInTheDocument());
    expect(screen.queryByTestId('conversation-dock')).not.toBeInTheDocument();
    expect(composerShown()).toBe(false);
    expect(fixtures.panel.mounts).toBe(0);
    expect(screen.getByTestId('case-detail-root').className).toContain('min-h-screen');
  });

  it('creator who handed it on, narrow — still no composer at any width', async () => {
    setViewport('narrow');
    await renderPage({ ...CASE, driver_id: 'u-grace', driver_display_name: 'Grace Hopper' });

    await waitFor(() => expect(screen.getByTestId('transcript-record')).toBeInTheDocument());
    expect(composerShown()).toBe(false);
  });

  it('a reader who neither created nor drives it — the record', async () => {
    viewer.id = 'u-linus';
    await renderPage({ ...CASE, driver_id: 'u-grace', driver_display_name: 'Grace Hopper' });

    await waitFor(() => expect(screen.getByTestId('transcript-record')).toBeInTheDocument());
    expect(composerShown()).toBe(false);
  });

  it('an UNKNOWN driver fails closed — even for the creator', async () => {
    // A core older than contract 13.2.0 sends no `driver_id`. Offering the
    // creator a composer on a guess is the defect ADR-020 removes.
    const noDriver: CaseFixture = { ...CASE };
    delete noDriver.driver_id;
    delete noDriver.driver_display_name;
    await renderPage(noDriver);

    await waitFor(() => expect(screen.getByTestId('transcript-record')).toBeInTheDocument());
    expect(composerShown()).toBe(false);
  });

  it('an UNKNOWN viewer fails closed', async () => {
    viewer.id = null;
    await renderPage();

    await waitFor(() => expect(screen.getByTestId('transcript-record')).toBeInTheDocument());
    expect(composerShown()).toBe(false);
  });
});

describe('Share stays the CREATOR\'s', () => {
  it('the creator who handed the case on still has Share', async () => {
    await renderPage({ ...CASE, driver_id: 'u-grace', driver_display_name: 'Grace Hopper' });

    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('the driver who did not create it has no Share', async () => {
    viewer.id = 'u-grace';
    await renderPage({ ...CASE, driver_id: 'u-grace', driver_display_name: 'Grace Hopper' });

    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('offers no Delete to anyone — this page has no delete; the creator deletes elsewhere', async () => {
    viewer.id = 'u-grace';
    await renderPage({ ...CASE, driver_id: 'u-grace', driver_display_name: 'Grace Hopper' });

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});

describe('who sees "Change driver"', () => {
  it('the creator who drives, with others to hand to', async () => {
    await renderPage();
    expect(await screen.findByRole('button', { name: /change driver/i })).toBeInTheDocument();
    expect(getDriverCandidates).toHaveBeenCalledWith('case-1');
  });

  it('the creator who does NOT drive — they may take it back', async () => {
    await renderPage({ ...CASE, driver_id: 'u-grace', driver_display_name: 'Grace Hopper' });
    expect(await screen.findByRole('button', { name: /change driver/i })).toBeInTheDocument();
  });

  it('the driver who did not create it — they may hand it on', async () => {
    viewer.id = 'u-grace';
    await renderPage({ ...CASE, driver_id: 'u-grace', driver_display_name: 'Grace Hopper' });
    expect(await screen.findByRole('button', { name: /change driver/i })).toBeInTheDocument();
  });

  it('NOT a reader who neither created nor drives it — and their candidates are never read', async () => {
    viewer.id = 'u-linus';
    await renderPage({ ...CASE, driver_id: 'u-grace', driver_display_name: 'Grace Hopper' });
    await waitFor(() => expect(screen.getByTestId('transcript-record')).toBeInTheDocument());

    expect(changeDriverButton()).not.toBeInTheDocument();
    expect(getDriverCandidates).not.toHaveBeenCalled();
  });

  it('NOT when the creator is the only candidate (standalone, or an unshared case)', async () => {
    vi.mocked(getDriverCandidates).mockResolvedValue([ADA]);
    await renderPage();
    await waitFor(() => expect(getDriverCandidates).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    expect(changeDriverButton()).not.toBeInTheDocument();
  });

  it('NOT when the candidates cannot be read', async () => {
    vi.mocked(getDriverCandidates).mockRejectedValue(new APIError('nope', 500));
    await renderPage();
    await waitFor(() => expect(getDriverCandidates).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    expect(changeDriverButton()).not.toBeInTheDocument();
  });

  it('YES on a terminal case — it still has driver-only writes', async () => {
    await renderPage({
      ...CASE,
      state: 'resolved' as never,
      is_terminal: true,
      resolved_at: '2026-01-03T00:00:00Z' as never,
    });
    const toggle = await screen.findByRole('button', { name: /change driver/i });
    expect(toggle).toBeEnabled();
  });
});

/** Opens the list and returns the candidate button for `name`. */
async function pick(name: string): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: /change driver/i }));
  const list = screen.getByRole('list', { name: /hand this case to/i });
  return within(list).getByRole('button', { name: new RegExp(name) });
}

describe('handing the case on', () => {
  it('PUTs the chosen candidate and applies the new driver AT ONCE — the dock goes', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('conversation-dock')).toBeInTheDocument());

    vi.mocked(reassignCaseDriver).mockResolvedValue({
      ...CASE,
      driver_id: 'u-grace',
      driver_display_name: 'Grace Hopper',
    } as never);
    // The follow-up re-read never lands, so whatever changes on screen came
    // from the PUT's own answer, not from the refresh.
    vi.mocked(getCaseDetail).mockReturnValue(new Promise(() => {}));

    fireEvent.click(await pick('Grace Hopper'));

    await waitFor(() =>
      expect(screen.queryByTestId('conversation-dock')).not.toBeInTheDocument(),
    );
    expect(reassignCaseDriver).toHaveBeenCalledWith('case-1', 'u-grace');
    expect(screen.getByTestId('case-driver-name')).toHaveTextContent('Grace Hopper');
    // The Transcript tab is back in the strip, as the record: no composer here.
    expect(screen.getByRole('button', { name: 'Transcript' })).toBeInTheDocument();
    expect(composerShown()).toBe(false);
    expect(screen.getByTestId('case-driver-status')).toHaveTextContent(
      'Grace Hopper now drives this case.',
    );
    // …and the whole case is re-read (the hand-off bumped its version).
    expect(getCaseDetail).toHaveBeenCalledTimes(2);
  });

  it('marks the current driver and does not offer them', async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /change driver/i }));
    const list = screen.getByRole('list', { name: /hand this case to/i });
    const current = within(list).getByRole('button', { name: /Ada Lovelace/ });

    expect(current).toBeDisabled();
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(current).toHaveTextContent('driving now');
  });

  it('is keyboard operable: aria-expanded, Escape closes and returns focus', async () => {
    await renderPage();
    const toggle = await screen.findByRole('button', { name: /change driver/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(list).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const grace = within(list as HTMLElement).getByRole('button', { name: /Grace Hopper/ });
    grace.focus();

    fireEvent.keyDown(grace, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(toggle);
    expect(reassignCaseDriver).not.toHaveBeenCalled();
  });
});

describe('the list closes when the user leaves it, and only then', () => {
  it('a press outside closes it; a press on a candidate does not', async () => {
    await renderPage();
    const toggle = await screen.findByRole('button', { name: /change driver/i });
    fireEvent.click(toggle);
    const list = screen.getByRole('list', { name: /hand this case to/i });

    // A button that takes no focus on click (Safari, Firefox on macOS): the
    // toggle blurs with nowhere to go, and the list must still be there.
    fireEvent.mouseDown(within(list).getByRole('button', { name: /Grace Hopper/ }));
    fireEvent.blur(toggle, { relatedTarget: null });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.mouseDown(screen.getByRole('heading', { name: CASE.title }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('Tab past the control closes it', async () => {
    await renderPage();
    const toggle = await screen.findByRole('button', { name: /change driver/i });
    fireEvent.click(toggle);

    fireEvent.blur(toggle, { relatedTarget: screen.getByRole('button', { name: 'Share' }) });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('when the hand-off is refused', () => {
  it('409 — says someone else changed it, and re-reads the case and the candidates', async () => {
    await renderPage();
    vi.mocked(reassignCaseDriver).mockRejectedValue(
      new APIError('conflict', 409, 'CASE_VERSION_CONFLICT'),
    );

    fireEvent.click(await pick('Grace Hopper'));

    await waitFor(() =>
      expect(screen.getByTestId('case-driver-status')).toHaveTextContent(
        /someone else changed this case/i,
      ),
    );
    expect(getCaseDetail).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(getDriverCandidates).toHaveBeenCalledTimes(2));
  });

  it('422 — the list was stale: re-reads the candidates, not the case', async () => {
    await renderPage();
    vi.mocked(reassignCaseDriver).mockRejectedValue(new APIError('not a candidate', 422));

    fireEvent.click(await pick('Grace Hopper'));

    await waitFor(() =>
      expect(screen.getByTestId('case-driver-status')).toHaveTextContent(
        /can no longer drive this case/i,
      ),
    );
    await waitFor(() => expect(getDriverCandidates).toHaveBeenCalledTimes(2));
    expect(getCaseDetail).toHaveBeenCalledTimes(1);
  });

  it.each([403, 404])('%s — no longer allowed: says so and re-reads the case', async (status) => {
    await renderPage();
    vi.mocked(reassignCaseDriver).mockRejectedValue(new APIError('refused', status));

    fireEvent.click(await pick('Grace Hopper'));

    await waitFor(() =>
      expect(screen.getByTestId('case-driver-status')).toHaveTextContent(
        /you can no longer change who drives this case/i,
      ),
    );
    expect(getCaseDetail).toHaveBeenCalledTimes(2);
  });

  it('any other failure — shows it and changes nothing', async () => {
    await renderPage();
    vi.mocked(reassignCaseDriver).mockRejectedValue(new APIError('Server exploded', 500));

    fireEvent.click(await pick('Grace Hopper'));

    await waitFor(() =>
      expect(screen.getByTestId('case-driver-status')).toHaveTextContent('Server exploded'),
    );
    expect(getCaseDetail).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('conversation-dock')).toBeInTheDocument();
  });
});
