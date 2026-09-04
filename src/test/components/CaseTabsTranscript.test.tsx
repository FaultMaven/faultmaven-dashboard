import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { CaseDetail } from '../../types/cases';

/**
 * The Transcript tab is the shared Copilot UI, not a read-only copy of it
 * (ADR-016 D1).
 *
 * Two renderers of one transcript already existed and had drifted: this
 * repository's 120-line `TranscriptView` and the extension's 680-line
 * `ChatWindow`. Retiring the copy is the point — and so is what replaces it,
 * because a read-only tab is precisely what stopped the Dashboard from being
 * able to continue an investigation.
 *
 * `TranscriptView` itself is NOT deleted: the operator break-glass page
 * (ADR-012 D9) renders another tenant's case, under a grant, with no
 * interaction — the interactive panel cannot answer for that page. Its own
 * suite still covers it. What is asserted here is that the OWNER'S tab no
 * longer uses it.
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

const getCaseMessages = vi.fn();
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
  organization_id: 'org1',
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

    expect(lastInitialCase).toEqual({ kind: 'existing', caseId: 'case-1' });
  });

  it('writes nothing into the panel’s storage to do it', async () => {
    // The tab used to hand the case over by writing the panel's own
    // active-case pointer before it mounted. It is an argument now, so the only
    // key this host writes is its assertion that the environment is ready.
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    const written = Object.keys(localStorage)
      .filter((key) => key.startsWith(PANEL_STORAGE_NAMESPACE))
      .map((key) => key.slice(PANEL_STORAGE_NAMESPACE.length))
      .sort();
    expect(written).toEqual(['hasCompletedFirstRun']);
  });

  it('remounts the panel when the route moves to another case', async () => {
    // The panel applies `initialCase` ONCE, at its own mount, and React Router
    // keeps this component instance across a `:caseId` change — so without the
    // `key` a move from one case to the next would leave the previous case's
    // transcript on screen with nothing thrown.
    const { rerender } = renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());
    expect(lastInitialCase).toEqual({ kind: 'existing', caseId: 'case-1' });

    rerender(
      <MemoryRouter initialEntries={['/?tab=transcript']}>
        <CaseTabs caseId="case-2" caseDetail={{ ...CASE, case_id: 'case-2' }} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(lastInitialCase).toEqual({ kind: 'existing', caseId: 'case-2' });
    });
  });
});
