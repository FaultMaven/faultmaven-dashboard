import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

/**
 * A CASE BEING DELETED (contract 14.15.0, faultmaven#2341 / #2605).
 *
 * While `GET /cases/{case_id}` reads `deleting: true` the page shows copilot's
 * ruled sentence, offers no Share and no hand-off, and re-reads the case on
 * copilot's schedule until it is gone, cleared, or the schedule ends. The panel
 * keeps its own deleting handling: the page passes it nothing about it. Fake
 * timers throughout; the page, the dock and the driver field are real.
 */

const fixtures = vi.hoisted(() => ({
  panelProps: [] as Record<string, unknown>[],
  onCaseChanged: undefined as undefined | ((id: string) => void),
}));

vi.mock('@faultmaven/copilot-ui', async () => {
  const React = await import('react');
  function Stub(props: Record<string, unknown>) {
    fixtures.panelProps.push(props);
    React.useEffect(() => {
      fixtures.onCaseChanged = props.onCaseChanged as (id: string) => void;
    }, [props.onCaseChanged]);
    return <div data-testid="shared-copilot-ui" />;
  }
  return {
    setHostStore: vi.fn(),
    setHostEndpoints: vi.fn(),
    setApiTransport: vi.fn(),
    clearApiTransport: vi.fn(),
    clearPersistedSession: vi.fn().mockResolvedValue(undefined),
    SessionSwitchedError: class SessionSwitchedError extends Error {},
    CredentialUnavailableError: class CredentialUnavailableError extends Error {},
    CopilotPanel: Stub,
  };
});

vi.mock('../../lib/api', () => ({
  getCaseDetail: vi.fn(),
  getDriverCandidates: vi.fn(),
  reassignCaseDriver: vi.fn(),
  fetchCaseMarkdown: vi.fn(),
  logoutAuth: vi.fn(),
  getCaseMessages: vi.fn().mockResolvedValue({ messages: [], total_count: 0 }),
  getUploadedFiles: vi.fn().mockResolvedValue({ files: [] }),
  getUploadedFileDetails: vi.fn().mockResolvedValue(null),
  getCaseEvidenceList: vi.fn().mockResolvedValue({ evidence: [] }),
  getCaseUI: vi.fn().mockResolvedValue({ active_hypotheses: [] }),
  getCaseReports: vi.fn().mockResolvedValue([]),
  getCaseReportDownloadUrl: vi.fn(),
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

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    authState: { user: { user_id: 'u-ada', username: 'ada', display_name: 'Ada L' } },
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
import { getCaseDetail, getDriverCandidates } from '../../lib/api';
import { APIError } from '../../lib/knowledge/errors';

const NOTICE = 'This case is being deleted, so nothing more can be added to it.';

/** Ada created and drives the case; Grace could be handed it. */
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
  deleting: false,
};
const DELETING = { ...CASE, deleting: true };
const CASE2 = { ...CASE, case_id: 'case-2', title: 'Second case title' };

const nav: { go?: (p: string) => void } = {};
function NavGrab() {
  const navigate = useNavigate();
  useEffect(() => {
    nav.go = navigate;
  }, [navigate]);
  return null;
}

/** Let `ms` of fake time pass, settling every promise it releases. */
const advance = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});
const reads = () => vi.mocked(getCaseDetail).mock.calls.length;
/** `row`, after `ms` of fake time (at once when 0: a timer would add a tick). */
const answer = (row: unknown, ms = 0) =>
  (ms ? new Promise((resolve) => setTimeout(() => resolve(row), ms)) : Promise.resolve(row)) as never;

async function renderPage() {
  const view = render(
    <MemoryRouter initialEntries={['/cases/case-1']}>
      <NavGrab />
      <Routes>
        <Route path="/cases/:caseId" element={<CaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await advance(0);
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  localStorage.clear();
  resetChatSurfaceForTests();
  fixtures.panelProps = [];
  fixtures.onCaseChanged = undefined;
  setViewport('wide');
  vi.mocked(getDriverCandidates).mockResolvedValue([
    { user_id: 'u-ada', display_name: 'Ada Lovelace' },
    { user_id: 'u-grace', display_name: 'Grace Hopper' },
  ] as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('while GET /cases/{id} reads deleting: true', () => {
  it('the header shows the ruled sentence and offers no Share or hand-off', async () => {
    vi.mocked(getCaseDetail).mockResolvedValue(DELETING as never);
    await renderPage();

    expect(screen.getByRole('heading', { name: CASE.title })).toBeInTheDocument();
    expect(screen.getAllByRole('status').some((el) => el.textContent === NOTICE)).toBe(true);
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change driver/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('case-driver-name')).toHaveTextContent('Ada Lovelace');
  });

  it('re-reads at 2 s, 4 s, 8 s, then every 10 s, and none past the 60 s cap', async () => {
    vi.mocked(getCaseDetail).mockResolvedValue(DELETING as never);
    await renderPage();
    expect(reads()).toBe(1);

    for (const wait of [2_000, 4_000, 8_000, 10_000, 10_000, 10_000, 10_000]) {
      await advance(wait - 1);
      const before = reads();
      await advance(1);
      expect(reads()).toBe(before + 1);
    }
    // 54 s in: the next would start at 64 s, past the cap.
    await advance(120_000);
    expect(reads()).toBe(8);
    expect(screen.getAllByRole('status').some((el) => el.textContent === NOTICE)).toBe(true);
  });

  it('counts the cap from when the read that first saw deleting was SENT', async () => {
    // The first read takes 7 s. Counted from its answer, a 7th re-read would
    // start at 61 s (54 s after); counted from its request, the 6th, at 51 s,
    // is the last.
    vi.mocked(getCaseDetail).mockImplementation(() => answer(DELETING, reads() === 1 ? 7_000 : 0));
    await renderPage();
    await advance(7_000);
    expect(screen.getByRole('heading', { name: CASE.title })).toBeInTheDocument();

    await advance(51_000 - 7_000);
    expect(reads()).toBe(7);
    await advance(120_000);
    expect(reads()).toBe(7);
  });

  it('a re-read answering 404 shows not-found and stops', async () => {
    vi.mocked(getCaseDetail).mockResolvedValue(DELETING as never);
    await renderPage();
    vi.mocked(getCaseDetail).mockRejectedValue(new APIError('Case not found', 404, 'CASE_NOT_FOUND'));

    await advance(2_000);
    expect(screen.getByRole('alert')).toHaveTextContent('Case not found');
    await advance(120_000);
    expect(reads()).toBe(2);
  });

  it('a re-read answering deleting: false restores Share and the hand-off, and stops', async () => {
    vi.mocked(getCaseDetail).mockResolvedValue(DELETING as never);
    await renderPage();
    vi.mocked(getCaseDetail).mockResolvedValue(CASE as never);

    await advance(2_000);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change driver/i })).toBeInTheDocument();
    await advance(120_000);
    expect(reads()).toBe(2);
  });

  it('unmount clears the timer', async () => {
    vi.mocked(getCaseDetail).mockResolvedValue(DELETING as never);
    const { unmount } = await renderPage();
    unmount();
    await advance(120_000);
    expect(reads()).toBe(1);
  });

  it('a re-read still in flight at unmount schedules nothing when it lands', async () => {
    let release!: (row: unknown) => void;
    vi.mocked(getCaseDetail).mockResolvedValue(DELETING as never);
    const { unmount } = await renderPage();
    vi.mocked(getCaseDetail).mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)) as never,
    );
    await advance(2_000);
    unmount();
    await act(async () => release(DELETING));
    await advance(120_000);
    expect(reads()).toBe(2);
  });

  it('a superseded re-read neither stalls the loop nor leaves a second one', async () => {
    let release!: (row: unknown) => void;
    vi.mocked(getCaseDetail).mockResolvedValue(DELETING as never);
    await renderPage();
    vi.mocked(getCaseDetail).mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)) as never,
    );
    await advance(2_000); // the loop's first re-read, held open
    expect(reads()).toBe(2);
    act(() => fixtures.onCaseChanged!('case-1')); // a newer read supersedes it
    await advance(0);
    await act(async () => release(DELETING));

    await advance(3_999);
    expect(reads()).toBe(3);
    await advance(1); // the loop goes on from where it was: 4 s after its read
    expect(reads()).toBe(4);
    await advance(120_000); // one chain: 8 s, then 10 s steps to 54 s
    expect(reads()).toBe(3 + 6);
  });

  it('the panel is given nothing about deleting: its props match a live case\'s', async () => {
    // Keys and primitive values compared, and a function by its key, nested
    // objects included: a derived prop (`readOnly`) shows as a changed value.
    const shape = (value: unknown): unknown =>
      typeof value === 'function'
        ? '<function>'
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
          : value;
    const lastPanelProps = async (row: unknown) => {
      fixtures.panelProps = [];
      vi.mocked(getCaseDetail).mockResolvedValue(row as never);
      const { unmount } = await renderPage();
      const last = fixtures.panelProps.at(-1);
      unmount();
      return shape(last);
    };
    const live = await lastPanelProps(CASE);
    expect(live).toBeTruthy();
    expect(await lastPanelProps(DELETING)).toEqual(live);
  });
});

describe('deleting arriving on a read while the page is in use', () => {
  it('closes an open Share modal', async () => {
    vi.mocked(getCaseDetail).mockResolvedValue(CASE as never);
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    vi.mocked(getCaseDetail).mockResolvedValue(DELETING as never);
    act(() => fixtures.onCaseChanged!('case-1'));
    await advance(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // When `deleting` clears it stays closed until it is asked for again.
    vi.mocked(getCaseDetail).mockResolvedValue(CASE as never);
    await advance(2_000);
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes an open hand-off list, keeping the driver named', async () => {
    vi.mocked(getCaseDetail).mockResolvedValue(CASE as never);
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /change driver/i }));
    expect(screen.getByRole('list', { name: /hand this case to/i })).toBeVisible();

    vi.mocked(getCaseDetail).mockResolvedValue(DELETING as never);
    act(() => fixtures.onCaseChanged!('case-1'));
    await advance(0);
    expect(screen.queryByRole('list', { name: /hand this case to/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('case-driver-name')).toHaveTextContent('Ada Lovelace');
  });

  it('renders the notice node empty before deleting, and sets only its text', async () => {
    vi.mocked(getCaseDetail).mockResolvedValue(CASE as never);
    await renderPage();
    const notice = screen.getByTestId('case-deleting-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('');

    vi.mocked(getCaseDetail).mockResolvedValue(DELETING as never);
    act(() => fixtures.onCaseChanged!('case-1'));
    await advance(0);
    expect(screen.getByTestId('case-deleting-notice')).toBe(notice);
    expect(notice).toHaveTextContent(NOTICE);
  });
});

describe('focus on a withheld control moves, never to <body>', () => {
  /** Load a live case, focus what `place` returns, then have a read see deleting. */
  async function withFocusOn(place: () => HTMLElement) {
    vi.mocked(getCaseDetail).mockResolvedValue(CASE as never);
    await renderPage();
    const target = place();
    act(() => target.focus());
    expect(document.activeElement).toBe(target);
    vi.mocked(getCaseDetail).mockResolvedValue(DELETING as never);
    act(() => fixtures.onCaseChanged!('case-1'));
    await advance(0);
    expect(target).not.toBeInTheDocument();
  }

  it('from the Change-driver toggle to the driver\'s name', async () => {
    await withFocusOn(() => screen.getByRole('button', { name: /change driver/i }));
    expect(document.activeElement).toBe(screen.getByTestId('case-driver-name'));
  });

  it('from a candidate in the open list to the driver\'s name', async () => {
    await withFocusOn(() => {
      fireEvent.click(screen.getByRole('button', { name: /change driver/i }));
      return screen.getByRole('button', { name: /Grace Hopper/ });
    });
    expect(document.activeElement).toBe(screen.getByTestId('case-driver-name'));
  });

  it('from the Share button to the notice', async () => {
    await withFocusOn(() => screen.getByRole('button', { name: 'Share' }));
    expect(document.activeElement).toBe(screen.getByTestId('case-deleting-notice'));
  });

  it('from inside the Share modal to the notice', async () => {
    await withFocusOn(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      return screen.getByRole('button', { name: 'Done' });
    });
    expect(document.activeElement).toBe(screen.getByTestId('case-deleting-notice'));
  });
});

describe('the re-reads key on the case SHOWN', () => {
  it('navigating from a deleting case to a slow one leaves the spinner', async () => {
    vi.mocked(getCaseDetail).mockImplementation((id: string) =>
      id === 'case-2' ? answer(CASE2, 5_000) : answer(DELETING),
    );
    await renderPage();
    expect(screen.getByRole('heading', { name: CASE.title })).toBeInTheDocument();

    await act(async () => nav.go!('/cases/case-2'));
    expect(screen.getByText('Loading case...')).toBeInTheDocument();
    await advance(5_000);
    expect(screen.queryByText('Loading case...')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: CASE2.title })).toBeInTheDocument();
    await advance(120_000);
    expect(vi.mocked(getCaseDetail).mock.calls.filter(([id]) => id === 'case-2')).toHaveLength(1);
  });
});
