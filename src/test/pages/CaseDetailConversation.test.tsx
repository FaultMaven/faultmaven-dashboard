import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * A CASE'S CONVERSATION IS READABLE IN EVERY STATE (ADR-018 D2).
 *
 * The ADR asks for this as a matrix, because it is the invariant an earlier
 * draft broke by deleting the Transcript tab outright, and the one #124 broke
 * from the other side by making that tab a live composer — so the case record
 * and the conversation about it became mutually exclusive tabs.
 *
 * Asserted at the PAGE, not at `CaseTabs`, because the page is where the rule
 * is asked and where the dock lives. A component test below it could not see
 * the two-column arrangement at all, and "exactly one surface renders the
 * conversation" is a statement about the whole page or it is nothing.
 *
 * WHAT THIS FILE CANNOT SAY. The panel is a stand-in, so on the live arms
 * "readable" means *the panel is mounted and opened on this case*. On the
 * read-only arms `TranscriptView` is REAL and the assertion is literal: the
 * words of the conversation are on screen. The arm that can be checked properly
 * is checked properly.
 */

/**
 * `vi.hoisted`, not top-level `const`s.
 *
 * `vi.mock` factories are hoisted above the file's own bindings and are
 * EVALUATED during module loading — here, as soon as `AccountMenu` statically
 * imports `../lib/api`. A factory closing over a plain `const` therefore throws
 * `Cannot access 'X' before initialization` at import time rather than failing
 * as a test, which is what this file did before the fixtures moved in here.
 */
const fixtures = vi.hoisted(() => ({
  messages: [
    {
      message_id: 'm1',
      turn_number: 1,
      role: 'user',
      content: 'The primary replica stopped accepting writes at 02:14.',
      created_at: '2026-01-01T02:14:00Z',
      author_id: 'owner-1',
      token_count: null,
      metadata: {},
    },
  ],
  /** A box, not a number: the factory closes over the object, tests reset the field. */
  panel: { mounts: 0 },
}));

vi.mock('@faultmaven/copilot-ui', () => ({
  setHostStore: vi.fn(),
  setHostEndpoints: vi.fn(),
  setApiTransport: vi.fn(),
  clearApiTransport: vi.fn(),
  clearPersistedSession: vi.fn().mockResolvedValue(undefined),
  CopilotPanel: ({ initialCase }: { initialCase?: { caseId?: string; readOnly?: boolean } }) => {
    // Counted at MOUNT, the way the real panel applies `initialCase` — so
    // "kept mounted across a collapse" is a claim this file can actually make.
    // Counting on render would make it true of a remount too.
    return (
      <MountCounter
        caseId={initialCase?.caseId ?? ''}
        readOnly={String(initialCase?.readOnly ?? '')}
      />
    );
  },
}));

vi.mock('../../lib/api', () => ({
  getCaseDetail: vi.fn(),
  fetchCaseMarkdown: vi.fn(),
  logoutAuth: vi.fn(),
  getCaseMessages: vi
    .fn()
    .mockResolvedValue({ messages: fixtures.messages, total_count: fixtures.messages.length }),
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

const viewer = { id: 'owner-1' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    authState: { user: { user_id: viewer.id, username: 'ada', display_name: 'Ada L' } },
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

import { useState } from 'react';
import CaseDetailPage from '../../pages/CaseDetailPage';
import { setViewport } from '../support/viewport';
import { writeDockCollapsed } from '../../lib/cases/dockPreference';
import { getCaseDetail } from '../../lib/api';

function MountCounter({ caseId, readOnly }: { caseId: string; readOnly: string }) {
  useState(() => {
    fixtures.panel.mounts += 1;
    return null;
  });
  return <div data-testid="shared-copilot-ui" data-case={caseId} data-readonly={readOnly} />;
}

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

async function renderPage() {
  vi.mocked(getCaseDetail).mockResolvedValue(CASE as never);
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

/** Where the conversation is, or `null`. Throws if two surfaces carry it. */
function conversationSurface(): 'dock' | 'tab-live' | 'tab-record' | null {
  const dock = screen.queryByTestId('conversation-dock');
  const dockBody = dock?.querySelector('[data-testid="conversation-dock-body"]');
  const dockShowing = !!dockBody && !dockBody.className.includes('hidden');
  const tabPanel = screen.queryByTestId('transcript-tab-panel');
  const record = screen.queryByTestId('transcript-record');

  const found = [dockShowing && 'dock', !!tabPanel && 'tab-live', !!record && 'tab-record'].filter(
    Boolean,
  ) as ('dock' | 'tab-live' | 'tab-record')[];
  if (found.length > 1) {
    throw new Error(`two surfaces are rendering one conversation: ${found.join(', ')}`);
  }
  return found[0] ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  fixtures.panel.mounts = 0;
  viewer.id = 'owner-1';
  setViewport('wide');
});

describe('the conversation is readable in every state', () => {
  it('owner, wide, dock open — in the dock, on this case', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    expect(conversationSurface()).toBe('dock');
    expect(screen.getByTestId('shared-copilot-ui')).toHaveAttribute('data-case', 'case-1');
  });

  it('owner, wide, dock collapsed — back in the tab, as the record', async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /collapse the conversation/i }));

    await waitFor(() =>
      expect(screen.getByText(/stopped accepting writes at 02:14/)).toBeInTheDocument(),
    );
    expect(conversationSurface()).toBe('tab-record');
  });

  it('owner, narrow — no dock at this width, so the tab carries the live panel', async () => {
    setViewport('narrow');
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    expect(screen.queryByTestId('conversation-dock')).not.toBeInTheDocument();
    expect(conversationSurface()).toBe('tab-live');
  });

  it('not the owner — the record, with the words of the conversation on screen', async () => {
    viewer.id = 'someone-else';
    await renderPage();

    await waitFor(() =>
      expect(screen.getByText(/stopped accepting writes at 02:14/)).toBeInTheDocument(),
    );
    expect(conversationSurface()).toBe('tab-record');
  });

  it('not the owner, narrow — still readable, still no composer', async () => {
    viewer.id = 'someone-else';
    setViewport('narrow');
    await renderPage();

    await waitFor(() =>
      expect(screen.getByText(/stopped accepting writes at 02:14/)).toBeInTheDocument(),
    );
    expect(conversationSurface()).toBe('tab-record');
    expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
  });
});

describe('the record and the conversation, at once', () => {
  it('are both on screen with the dock in its default state', async () => {
    // The workflow the dock exists to create, and the one the tab layout
    // violated silently: read the report while asking about it.
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Report' }));

    expect(screen.getByRole('button', { name: 'Report' }).className).toContain('text-fm-accent');
    expect(within(screen.getByTestId('conversation-dock')).getByTestId('shared-copilot-ui'))
      .toBeInTheDocument();
  });

  it('hides the Transcript tab while the dock is showing the conversation', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: 'Transcript' })).not.toBeInTheDocument();
    // …and the tab strip still opens on something real rather than nothing.
    expect(screen.getByRole('button', { name: 'Issue' }).className).toContain('text-fm-accent');
  });

  it('brings the Transcript tab back when the dock is collapsed', async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /collapse the conversation/i }));

    expect(await screen.findByRole('button', { name: 'Transcript' })).toBeInTheDocument();
  });
});

describe('the dock mounts only where it is showing', () => {
  it('mounts nothing at all when it has never been opened', async () => {
    // "A dock that has never been opened is proven to mount nothing: no package
    // chunk, no session, no transcript fetch." Seeded collapsed, as a returning
    // viewer who closed it last time would find it.
    // Through the module that OWNS the key. `dockPreference.ts` says one module
    // knows it; a test spelling the physical key and its JSON encoding is the
    // second caller that invariant exists to prevent, and a rename would make
    // this seed a silent no-op that fails pointing at the dock.
    writeDockCollapsed(true);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('conversation-dock')).toBeInTheDocument());

    // The CONTAINER is there — both toggles name it in `aria-controls`, and a
    // dangling reference is an ARIA validity error — but it is EMPTY, which is
    // the claim that matters: nothing of the panel has been reached.
    expect(screen.getByTestId('conversation-dock-body')).toBeEmptyDOMElement();
    expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
    expect(fixtures.panel.mounts).toBe(0);
  });

  it('keeps the SAME instance across a collapse, so a turn in flight survives', async () => {
    // The panel owns its session, its conversation cache and any turn in
    // progress. Unmounting on collapse would throw away a turn the user is
    // waiting on — so the dock hides it instead.
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());
    expect(fixtures.panel.mounts).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /collapse the conversation/i }));
    await screen.findByRole('button', { name: /show the conversation/i });
    fireEvent.click(screen.getByRole('button', { name: /show the conversation/i }));
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    // Still ONE mount — hidden and shown again, never re-created.
    expect(fixtures.panel.mounts).toBe(1);
  });

  it('remembers the collapsed state for this viewer', async () => {
    const { unmount } = await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /collapse the conversation/i }));
    unmount();

    await renderPage();
    expect(await screen.findByRole('button', { name: /show the conversation/i })).toBeInTheDocument();
  });
});

describe('the collapsed rail is a valid control', () => {
  it('points aria-controls at an element that exists, even before a first open', async () => {
    // The state a returning viewer arrives in. `aria-expanded` on a control
    // whose target is not in the document is an ARIA validity error and leaves
    // a screen reader with a region it cannot resolve.
    writeDockCollapsed(true);
    await renderPage();

    const rail = await screen.findByRole('button', { name: /show the conversation/i });
    const controlled = rail.getAttribute('aria-controls');
    expect(controlled).toBeTruthy();
    expect(rail).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(controlled as string)).not.toBeNull();
  });
});

describe('exactly one panel instance per page', () => {
  it('in every state the rule can produce', async () => {
    for (const [width, id] of [
      ['wide', 'owner-1'],
      ['narrow', 'owner-1'],
      ['wide', 'someone-else'],
      ['narrow', 'someone-else'],
    ] as const) {
      localStorage.clear();
      fixtures.panel.mounts = 0;
      setViewport(width);
      viewer.id = id;

      const { unmount } = await renderPage();
      await waitFor(() => expect(conversationSurface()).not.toBeNull());

      expect(screen.queryAllByTestId('shared-copilot-ui').length).toBeLessThanOrEqual(1);
      expect(fixtures.panel.mounts).toBeLessThanOrEqual(1);
      unmount();
    }
  });

  it('never gives a non-owner a writable panel', async () => {
    // Asserted against the case's `user_id`, not against the presence of a
    // Share button. There is no composer for them at all — but the dock's own
    // `readOnly` is still correct, so a future input to the rule cannot hand a
    // viewer a composer by being wrong in one place.
    viewer.id = 'someone-else';
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/stopped accepting writes at 02:14/)).toBeInTheDocument(),
    );

    expect(screen.queryByTestId('conversation-dock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
  });
});

describe('narrow width keeps ONE interaction model', () => {
  it('introduces no overlay, sheet or fixed-position surface at any width', async () => {
    // "The dock collapses into the tab strip — it never becomes an overlay."
    // A second interaction model that appears at a breakpoint is the thing that
    // reads as bolted on.
    setViewport('narrow');
    const { container } = await renderPage();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    const overlays = container.querySelectorAll(
      '.fixed, [role="dialog"][aria-modal="true"], .inset-0',
    );
    expect(overlays.length, 'narrow width must not introduce an overlay').toBe(0);
  });
});
