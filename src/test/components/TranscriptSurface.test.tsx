import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { CaseDetail } from '../../types/cases';

/**
 * A CASE'S CONVERSATION IS READABLE IN EVERY STATE (ADR-018 D2).
 *
 * This is the invariant an earlier draft of the ADR broke by deleting the
 * Transcript tab outright, and the one faultmaven-dashboard#124 broke from the
 * other side by making the tab a live composer — so a teammate viewing someone
 * else's case paid for a whole panel mount to be told they could not type, and
 * the record and the conversation about it became mutually exclusive tabs.
 *
 * The rule is ONE question — *does this user have a composer somewhere else?* —
 * and it is asserted here twice: once over `transcriptRenderer` directly, where
 * all four rows of D2's table can be stated including the ones whose inputs do
 * not exist yet, and once through the rendered tab, where only the rows the app
 * can currently produce are reachable.
 *
 * WHAT THIS FILE CANNOT SAY. On the live arm the panel is a stand-in, so
 * "readable" there means *the surface that carries the conversation is mounted
 * and opened on this case* — the real panel fetches its own messages and this
 * environment must not pretend to have watched it. On the read-only arm
 * `TranscriptView` is REAL and the assertion is the literal one: the words of
 * the conversation are on screen. That asymmetry is deliberate; the arm that
 * can be checked properly is checked properly.
 *
 * The other half of the ADR's requirement — that the read-only arm costs no
 * package chunk at all — is a module-level fact and cannot be asserted here,
 * because a module import is cached for the lifetime of a test FILE and any
 * earlier live-arm test in this one would have already paid it. It lives in
 * `src/test/copilot/noPanelOnReadOnlyTranscript.test.tsx`.
 */

vi.mock('@faultmaven/copilot-ui', () => ({
  setHostStore: vi.fn(),
  setHostEndpoints: vi.fn(),
  setApiTransport: vi.fn(),
  clearApiTransport: vi.fn(),
  clearPersistedSession: vi.fn().mockResolvedValue(undefined),
  CopilotPanel: ({ initialCase }: { initialCase?: { caseId?: string } }) => (
    <div data-testid="shared-copilot-ui" data-case={initialCase?.caseId}>
      shared UI
    </div>
  ),
}));

const MESSAGES = [
  {
    message_id: 'm1',
    turn_number: 1,
    role: 'user',
    content: 'The primary replica stopped accepting writes at 02:14.',
    created_at: '2026-01-01T02:14:00Z',
    author_id: 'u1',
    token_count: null,
    metadata: {},
  },
  {
    message_id: 'm2',
    turn_number: 1,
    role: 'assistant',
    content: 'Check whether the WAL volume filled — that fails writes and not reads.',
    created_at: '2026-01-01T02:15:00Z',
    author_id: null,
    token_count: null,
    metadata: {},
  },
];

const getCaseMessages = vi.fn();
vi.mock('../../lib/api', () => ({
  getCaseMessages: (...args: unknown[]) => getCaseMessages(...args),
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
  useAuth: () => ({ authState: { user: { user_id: viewer.id } } }),
}));

vi.mock('../../config', () => ({
  default: { apiUrl: 'https://api.faultmaven.ai', inputLimits: {} },
}));

import { CaseTabs } from '../../components/CaseTabs';
import { transcriptRenderer } from '../../lib/cases/transcriptSurface';

const CASE: CaseDetail = {
  case_id: 'case-7',
  title: 'Replica stopped accepting writes',
  description: 'Writes fail, reads succeed',
  state: 'investigating',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  last_activity_at: '2026-01-02T00:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'owner-1',
  enterprise_id: 'ent-1',
  current_turn: 1,
  source: 'copilot',
  is_terminal: false,
  turns_without_progress: 0,
  current_stage: null,
  milestones_completed: [],
  pending_milestones: [],
  evidence_count: 0,
  hypothesis_count: 0,
  solution_count: 0,
  escalated: false,
};

function renderTabs(tab = 'transcript') {
  return render(
    <MemoryRouter initialEntries={[`/?tab=${tab}`]}>
      <CaseTabs caseId={CASE.case_id} caseDetail={CASE} />
    </MemoryRouter>,
  );
}

/** The one surface showing the conversation, or `null` if there is none. */
function conversationSurface(): 'panel' | 'record' | null {
  const panel = screen.queryByTestId('transcript-panel-holder');
  const record = screen.queryByTestId('transcript-record');
  if (panel && record) throw new Error('two surfaces are rendering one conversation');
  if (panel) return 'panel';
  if (record) return 'record';
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  viewer.id = 'owner-1';
  getCaseMessages.mockResolvedValue({ messages: MESSAGES, total_count: MESSAGES.length });
});

describe('the rule: does this user have a composer somewhere else?', () => {
  // ADR-018 D2's table, stated as a table. The `composerElsewhere: true` rows
  // are the ones sequencing rows 2 and 6 will start producing — the dock, and
  // the "use the Copilot extension for chat" preference. They are asserted now
  // so that landing those rows is a change of INPUT and not a change of rule.
  const TABLE: {
    row: string;
    isOwner: boolean;
    composerElsewhere: boolean;
    expected: 'panel' | 'read-only';
  }[] = [
    { row: 'preference on — the composer is in the extension',
      isOwner: true, composerElsewhere: true, expected: 'read-only' },
    { row: 'preference off, wide — the composer is in the dock',
      isOwner: true, composerElsewhere: true, expected: 'read-only' },
    { row: 'preference off, narrow — no composer anywhere else',
      isOwner: true, composerElsewhere: false, expected: 'panel' },
    { row: 'not the owner, composer elsewhere — no composer for them at all',
      isOwner: false, composerElsewhere: true, expected: 'read-only' },
    { row: 'not the owner, nothing elsewhere — non-ownership still wins',
      isOwner: false, composerElsewhere: false, expected: 'read-only' },
  ];

  it.each(TABLE)('$row → $expected', ({ isOwner, composerElsewhere, expected }) => {
    expect(transcriptRenderer({ isOwner, composerElsewhere })).toBe(expected);
  });

  it('never answers "panel" for a non-owner, whatever else is true', () => {
    // The rule's one safety property, stated separately from the table so that
    // editing a row cannot quietly delete it.
    for (const composerElsewhere of [true, false]) {
      expect(transcriptRenderer({ isOwner: false, composerElsewhere })).toBe('read-only');
    }
  });
});

describe('the conversation is readable in every state the app can produce', () => {
  it('owner: the live panel, opened on this case', async () => {
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    expect(conversationSurface()).toBe('panel');
    expect(screen.getByTestId('shared-copilot-ui')).toHaveAttribute('data-case', 'case-7');
  });

  it('non-owner: the record, with the words of the conversation on screen', async () => {
    viewer.id = 'someone-else';
    renderTabs();

    // The literal assertion — `TranscriptView` is the real component here, so
    // this is the conversation itself rendered, not a stand-in for it.
    await waitFor(() =>
      expect(screen.getByText(/stopped accepting writes at 02:14/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/WAL volume filled/)).toBeInTheDocument();
    expect(conversationSurface()).toBe('record');
  });

  it('unknown viewer: still readable, and still no composer', async () => {
    // Fails closed. An unknown viewer is not a match for the owner, so they get
    // the record — readable, which is the invariant, and read-only, which is the
    // safe answer.
    viewer.id = '';
    renderTabs();

    await waitFor(() =>
      expect(screen.getByText(/stopped accepting writes at 02:14/)).toBeInTheDocument(),
    );
    expect(conversationSurface()).toBe('record');
  });

  it('an empty conversation is still a readable state, not a broken one', async () => {
    viewer.id = 'someone-else';
    getCaseMessages.mockResolvedValue({ messages: [], total_count: 0 });
    renderTabs();

    await waitFor(() => expect(screen.getByText('No messages yet.')).toBeInTheDocument());
    expect(conversationSurface()).toBe('record');
  });

  it('a transcript that fails to load says so rather than rendering nothing', async () => {
    viewer.id = 'someone-else';
    getCaseMessages.mockRejectedValue(new Error('Failed to get case messages'));
    renderTabs();

    await waitFor(() =>
      expect(screen.getByText('Failed to get case messages')).toBeInTheDocument(),
    );
  });

  it('and a failure on one case does not poison the next one', async () => {
    // `CaseTabs` carries no `key` on the route's `:caseId`, so this component
    // instance SURVIVES a move from one case to another — and the error guard
    // wins over loaded messages. Without clearing the error at the top of each
    // attempt, one failed case shows its error over every later transcript that
    // loaded perfectly well, for as long as the page stays open.
    viewer.id = 'someone-else';
    getCaseMessages.mockRejectedValueOnce(new Error('Failed to get case messages'));
    const { rerender } = renderTabs();
    await waitFor(() =>
      expect(screen.getByText('Failed to get case messages')).toBeInTheDocument(),
    );

    rerender(
      <MemoryRouter initialEntries={['/?tab=transcript']}>
        <CaseTabs caseId="case-8" caseDetail={{ ...CASE, case_id: 'case-8' }} />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText(/stopped accepting writes at 02:14/)).toBeInTheDocument(),
    );
    expect(screen.queryByText('Failed to get case messages')).not.toBeInTheDocument();
  });
});

describe('exactly one surface renders the conversation', () => {
  it('never both, on either arm', async () => {
    // `conversationSurface()` throws when it finds two, so each arm is checked
    // by asking it — one render at a time, because two trees in one document
    // would make "two surfaces" mean something else entirely.
    const owner = renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());
    expect(conversationSurface()).toBe('panel');
    owner.unmount();

    viewer.id = 'someone-else';
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('transcript-record')).toBeInTheDocument());
    expect(conversationSurface()).toBe('record');
  });

  it('the read-only arm mounts no panel and starts no session', async () => {
    viewer.id = 'someone-else';
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('transcript-record')).toBeInTheDocument());

    // `copilot-panel-loading` is what a mount in flight looks like, so its
    // absence rules out "the panel is starting" as well as "the panel is here".
    expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
    expect(screen.queryByTestId('copilot-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('copilot-panel-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transcript-tab-panel')).not.toBeInTheDocument();
  });

  it('the live arm fetches no transcript of its own', async () => {
    // Two clients, two caches, two chances to disagree about what was said.
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    expect(getCaseMessages).not.toHaveBeenCalled();
  });
});

describe('the tab strip', () => {
  it('offers Transcript on both arms, and opens on it', async () => {
    // Transcript is the default tab, as it was before #124. What changed there
    // was what it RENDERS, not which tab opens — so the default survives this
    // change too, on whichever arm the rule picks.
    for (const id of ['owner-1', 'someone-else']) {
      viewer.id = id;
      const { unmount } = renderTabs('');
      await waitFor(() => expect(conversationSurface()).not.toBeNull());
      expect(screen.getByRole('button', { name: 'Transcript' }).className).toContain(
        'text-fm-accent',
      );
      unmount();
    }
  });

  it('carries the record tabs whichever arm the transcript takes', async () => {
    viewer.id = 'someone-else';
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('transcript-record')).toBeInTheDocument());

    for (const label of ['Transcript', 'Issue', 'Report', 'Evidence']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});
