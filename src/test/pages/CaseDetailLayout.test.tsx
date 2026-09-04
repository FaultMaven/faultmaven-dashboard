import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * The composer has to be on screen without scrolling.
 *
 * A panel whose input is below the fold is a panel you must scroll to use, and
 * the first thing a user does on the Transcript tab is type. Measured in a
 * browser before this was fixed: the panel started at y≈384 under the page
 * header and the case card, took `h-[70vh] min-h-[28rem]`, and put its composer
 * at y≈943 on a 1440×900 viewport and y≈851 on 1024×768 — below the fold at
 * both. `/investigate`, which sizes the panel to the room the page has left,
 * fitted exactly.
 *
 * WHAT THIS FILE CAN AND CANNOT DO. jsdom performs no layout: every element is
 * 0×0, so an assertion about y≈943 is unavailable here and the geometry above
 * was measured in a real browser (see the PR body). What IS checkable is the
 * CONTRACT that produces it, and it happens to be the part that actually broke:
 * a viewport-bounded page, and an unbroken `min-h-0` chain from that page down
 * to the panel.
 *
 * That chain is not a style preference. A flex item defaults to
 * `min-height: auto` and refuses to shrink below its content, so ONE missing
 * `min-h-0` anywhere on the path silently pushes the overflow back onto the
 * page and the composer back under the fold — with nothing thrown, nothing
 * logged, and every other test still green.
 */

vi.mock('../../lib/api', () => ({
  getCaseDetail: vi.fn(),
  fetchCaseMarkdown: vi.fn(),
  logoutAuth: vi.fn(),
  getUploadedFiles: vi.fn().mockResolvedValue([]),
  getUploadedFileDetails: vi.fn().mockResolvedValue(null),
  getCaseEvidenceList: vi.fn().mockResolvedValue([]),
  getCaseUI: vi.fn().mockResolvedValue({ active_hypotheses: [] }),
}));

vi.mock('@faultmaven/copilot-ui', () => ({
  setHostStore: vi.fn(),
  setHostEndpoints: vi.fn(),
  setApiTransport: vi.fn(),
  clearPersistedSession: vi.fn().mockResolvedValue(undefined),
  CopilotPanel: () => <div data-testid="shared-copilot-ui">shared UI</div>,
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
    user_id: 'u1',
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
    authState: { user: { user_id: 'u1', username: 'ada', display_name: 'Ada L' } },
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
import { getCaseDetail } from '../../lib/api';

const CASE = {
  case_id: 'case-1',
  title: 'DB Outage',
  description: 'Primary DB unresponsive',
  state: 'investigating' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  last_activity_at: '2026-01-02T00:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'u1',
  organization_id: 'org1',
  current_turn: 5,
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

/** Height-related utility classes, so a regression is reported in its own terms. */
function heightClasses(el: Element): string[] {
  return Array.from(el.classList).filter((c) =>
    /^(h-|min-h-|max-h-|flex-1|flex-auto|flex-none|flex-shrink|overflow-|absolute|fixed)/.test(c),
  );
}

async function renderCaseDetail() {
  vi.mocked(getCaseDetail).mockResolvedValue(CASE as never);
  const result = render(
    <MemoryRouter initialEntries={['/cases/case-1?tab=transcript']}>
      <Routes>
        <Route path="/cases/:caseId" element={<CaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByTestId('transcript-panel-holder')).toBeInTheDocument());
  return result;
}

describe('the case detail page is bounded by the viewport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('takes the viewport height rather than growing with its content', async () => {
    const { container } = await renderCaseDetail();
    const root = container.firstElementChild as HTMLElement;

    // `min-h-screen` is the content-driven shape this replaced: it lets the
    // page grow, which is what pushed the panel's composer past the fold.
    //
    // `h-dvh` and not `h-screen`: `vh` ignores mobile browser toolbars, so the
    // bottom of the page — the composer — ends up underneath them.
    expect(root.classList.contains('h-dvh')).toBe(true);
    expect(root.classList.contains('h-screen')).toBe(false);
    expect(root.classList.contains('min-h-screen')).toBe(false);
    expect(root.classList.contains('flex')).toBe(true);
    expect(root.classList.contains('flex-col')).toBe(true);
  });

  it('keeps a floor below which the PAGE scrolls instead of crushing the panel', async () => {
    // Bounding the page must not mean the content has no minimum. A laptop with
    // devtools open, or a split screen, would otherwise squeeze the panel
    // towards nothing — trading the composer-below-the-fold bug for an
    // unusable one at a different viewport.
    const { container } = await renderCaseDetail();
    const root = container.firstElementChild as HTMLElement;

    const floor = Array.from(root.classList).find((c) => /^min-h-\[/.test(c));
    expect(floor, 'the root needs a minimum height to scroll below').toBeDefined();
  });

  it('keeps the case header from shrinking, so it stays visible', async () => {
    await renderCaseDetail();
    const header = screen.getByRole('heading', { name: 'DB Outage' }).closest('div.bg-fm-surface');

    expect(header).not.toBeNull();
    expect(heightClasses(header!)).toContain('flex-shrink-0');
  });
});

describe('the panel takes the room the page has left', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('never names its own height', async () => {
    // The exact regression: a viewport fraction or a fixed floor makes the
    // panel's size independent of where it starts, so it overhangs whatever is
    // above it.
    await renderCaseDetail();
    const holder = screen.getByTestId('transcript-panel-holder');

    for (const cls of heightClasses(holder)) {
      expect(cls, `${cls} sizes the panel independently of its container`).not.toMatch(
        /^(h|min-h|max-h)-\[.*(vh|dvh|svh|lvh|rem|px)/,
      );
    }
    expect(holder.classList.contains('h-full')).toBe(true);
  });

  it('has an UNBROKEN min-h-0 chain from the page root down to it', async () => {
    // One missing `min-h-0` anywhere on this path re-creates the bug in
    // silence: the flex item refuses to shrink below its content, the overflow
    // lands back on the page, and the composer goes under the fold again.
    const { container } = await renderCaseDetail();
    const root = container.firstElementChild as HTMLElement;
    const holder = screen.getByTestId('transcript-panel-holder');

    const chain: HTMLElement[] = [];
    for (let el = holder.parentElement; el && el !== root; el = el.parentElement) {
      chain.push(el);
    }
    // Fail closed: an empty chain would assert nothing at all.
    expect(chain.length).toBeGreaterThan(2);

    for (const el of chain) {
      const classes = Array.from(el.classList);
      // Only flex CHILDREN that are asked to grow need it; a plain wrapper does
      // not. `flex-1` without `min-h-0` is precisely the trap.
      if (classes.includes('flex-1')) {
        expect(
          classes,
          `<${el.tagName.toLowerCase()} class="${el.className}"> grows but will not shrink`,
        ).toContain('min-h-0');
      }
    }
  });

  it('does not put a second scroll container around the panel', async () => {
    // The panel scrolls its own transcript and pins its own composer. A
    // scroller here would give it a second one — the composer would sit at the
    // bottom of an inner scroll region, off screen again.
    await renderCaseDetail();
    const holder = screen.getByTestId('transcript-panel-holder');
    const tabPanel = screen.getByTestId('transcript-tab-panel');

    for (const el of [holder, tabPanel]) {
      expect(heightClasses(el).filter((c) => c.startsWith('overflow-y-'))).toHaveLength(0);
    }
  });
});
