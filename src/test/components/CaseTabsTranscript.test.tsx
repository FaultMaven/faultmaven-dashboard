import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@faultmaven/copilot-ui', () => ({
  setHostStore: vi.fn(),
  setHostEndpoints: vi.fn(),
  setApiTransport: vi.fn(),
  CopilotPanel: () => <div data-testid="shared-copilot-ui">shared UI</div>,
}));

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

  it('opens the panel ON THIS CASE', async () => {
    // Seeded through the panel's own active-case pointer in host storage,
    // before the panel mounts and hydrates from it.
    renderTabs();
    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());

    expect(localStorage.getItem(`${PANEL_STORAGE_NAMESPACE}faultmaven_current_case`)).toBe(
      JSON.stringify('case-1'),
    );
  });
});
