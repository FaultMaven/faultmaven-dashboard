import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { CaseDetail } from '../../types/cases';

/**
 * The LIVE arm of the Transcript tab — the shared Copilot UI, mounted when this
 * tab is where the user's composer lives (ADR-016 D1, as scoped by ADR-018 D2).
 *
 * What is asserted here is the panel arm's wiring: that it is the shared UI and
 * not a second chat window, that it is told which case to open rather than
 * being handed one through storage, that it survives a tab change, and that it
 * remounts on a case change.
 *
 * WHICH ARM a given user gets is not decided here — that is
 * `transcriptSurface`'s one question, and `TranscriptSurface.test.tsx` binds
 * the whole matrix. This file fixes the owner-on-this-case corner of it, which
 * is the corner the panel occupies today.
 */

let lastInitialCase: unknown;

/**
 * The stand-in applies `initialCase` ONCE PER INSTANCE, because that is what
 * the real panel does — `useState`'s initialiser runs exactly at mount.
 *
 * Recording it on every render instead would make the remount test below
 * vacuous: a prop passed straight through changes on re-render whether or not a
 * new panel mounted, so the test would pass with the `key` removed and assert
 * nothing about the defect it exists for. It did, until this was fixed.
 */
vi.mock('@faultmaven/copilot-ui', async () => {
  const { useState } = await import('react');
  return {
    setHostStore: vi.fn(),
    setHostEndpoints: vi.fn(),
    setApiTransport: vi.fn(),
    clearPersistedSession: vi.fn().mockResolvedValue(undefined),
  DASHBOARD_PANEL_ATTR: 'data-faultmaven-dashboard-panel',
  DASHBOARD_PANEL_MESSAGE: 'FM_DASHBOARD_PANEL_AVAILABLE',
  dashboardAdvertisesPanel: (doc: Document = document) => {
  const v = doc.documentElement.getAttribute('data-faultmaven-dashboard-panel');
  return v !== null && v !== '' && v !== 'false' && v !== '0';
  },
    CopilotPanel: ({ initialCase }: { initialCase?: unknown }) => {
      useState(() => {
        lastInitialCase = initialCase;
        return null;
      });
      return <div data-testid="shared-copilot-ui">shared UI</div>;
    },
  };
});

const transcriptViewRenders = vi.fn();
vi.mock('../../components/TranscriptView', () => ({
  transcriptProseClasses: '',
  TranscriptView: () => {
    transcriptViewRenders();
    return <div data-testid="read-only-transcript-view" />;
  },
}));

// Resolved, not bare: the READ-ONLY arm actually calls this, and a `vi.fn()`
// returning undefined would fail it with a TypeError that looks nothing like
// the thing under test. `vi.clearAllMocks()` clears calls, not implementations.
const getCaseMessages = vi.fn().mockResolvedValue({ messages: [], total_count: 0 });
vi.mock('../../lib/api', () => ({
  getCaseMessages: (...args: unknown[]) => getCaseMessages(...args),
  getUploadedFiles: vi.fn().mockResolvedValue([]),
  getUploadedFileDetails: vi.fn().mockResolvedValue(null),
  getCaseEvidenceList: vi.fn().mockResolvedValue([]),
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

const currentUserId = { value: 'u1' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ authState: { user: { user_id: currentUserId.value } } }),
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

vi.mock('../../config', () => ({
  default: { apiUrl: 'https://api.faultmaven.ai', inputLimits: {} },
}));

import { CaseTabs } from '../../components/CaseTabs';
import { PANEL_STORAGE_NAMESPACE } from '../../copilot/webHost';

const CASE: CaseDetail = {
  case_id: 'case-1',
  title: 'DB Outage',
  description: 'Primary DB unresponsive',
  state: 'investigating',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  last_activity_at: '2024-01-02T00:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'u1',
  enterprise_id: 'ent-1',
  current_turn: 5,
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

function renderTabs() {
  return render(
    <MemoryRouter initialEntries={['/?tab=transcript']}>
      <CaseTabs caseId={CASE.case_id} caseDetail={CASE} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  lastInitialCase = undefined;
  // Reset to the OWNER. `currentUserId` is module state that the non-owner
  // block below mutates, and which arm renders now depends on it — so without
  // this, test order decides what the live-arm cases are even looking at.
  currentUserId.value = 'u1'; // CASE.user_id
});

describe('the Transcript tab', () => {
  it('renders the shared Copilot UI', async () => {
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());
  });

  it('does NOT render the read-only TranscriptView', async () => {
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    expect(transcriptViewRenders).not.toHaveBeenCalled();
    expect(screen.queryByTestId('read-only-transcript-view')).not.toBeInTheDocument();
  });

  it('fetches no messages of its own', async () => {
    // The panel loads its own transcript from the same API. A second fetch here
    // would be the second renderer coming back by another route: two clients,
    // two caches, two chances to disagree about what was said.
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    expect(getCaseMessages).not.toHaveBeenCalled();
  });

  it('stays mounted when another tab is showing', async () => {
    // Unmounting would tear down the panel's session, its conversation cache
    // and any turn in flight, so a glance at Evidence and back cost the user
    // their work. It is hidden instead.
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Issue' }));

    await waitFor(() => {
      expect(screen.getByTestId('transcript-tab-panel').className).toContain('hidden');
    });
    // Still THERE — same instance, not re-created.
    expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument();
  });

  it('opens the panel ON THIS CASE, by telling it so', async () => {
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    expect(lastInitialCase).toEqual({ kind: 'existing', caseId: 'case-1', readOnly: false });
  });

  it('writes nothing into the panel’s storage to do it', async () => {
    // The tab used to hand the case over by writing the panel's own
    // active-case pointer before it mounted. It is an argument now, and the
    // onboarding flag went with `chrome: 'embedded'` — so this host writes
    // nothing into the panel's storage at all.
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    const written = Object.keys(localStorage)
      .filter((key) => key.startsWith(PANEL_STORAGE_NAMESPACE))
      .map((key) => key.slice(PANEL_STORAGE_NAMESPACE.length))
      .sort();
    expect(written).toEqual([]);
  });

  it('remounts the panel when the route moves to another case', async () => {
    // The panel applies `initialCase` ONCE, at its own mount, and React Router
    // keeps this component instance across a `:caseId` change — so without the
    // `key` a move from one case to the next would leave the previous case's
    // transcript on screen with nothing thrown.
    const { rerender } = renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());
    expect(lastInitialCase).toEqual({ kind: 'existing', caseId: 'case-1', readOnly: false });

    rerender(
      <MemoryRouter initialEntries={['/?tab=transcript']}>
        <CaseTabs caseId="case-2" caseDetail={{ ...CASE, case_id: 'case-2' }} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(lastInitialCase).toEqual({ kind: 'existing', caseId: 'case-2', readOnly: false });
    });
  });
});


describe('a case someone else owns', () => {
  it('renders the READ-ONLY record for a non-owner, and mounts no panel', async () => {
    // A shared case is another person's investigation. Replacing the read-only
    // transcript with the panel handed a viewer a live composer and an upload,
    // so a teammate could post turns into an owner's case — an authoring right
    // the old view never granted. They now get the record back (ADR-018 D2),
    // which also means they stop paying for a panel mount to be told they
    // cannot type.
    currentUserId.value = 'someone-else';

    renderTabs();
    await waitFor(() => expect(screen.getByTestId('read-only-transcript-view')).toBeInTheDocument());

    expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transcript-panel-holder')).not.toBeInTheDocument();
    expect(lastInitialCase).toBeUndefined();
  });

  it('opens the live panel for the owner', async () => {
    currentUserId.value = 'u1'; // CASE.user_id

    renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    expect(lastInitialCase).toEqual({ kind: 'existing', caseId: 'case-1', readOnly: false });
  });

  it('fails CLOSED when the viewer is unknown', async () => {
    // No signed-in user id to compare against is not a match. The record is the
    // safe answer; a composer-by-default is not.
    currentUserId.value = '';

    renderTabs();
    await waitFor(() => expect(screen.getByTestId('read-only-transcript-view')).toBeInTheDocument());

    expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
  });
});
