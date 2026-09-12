import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { CaseDetail } from '../../types/cases';

/**
 * The read-only Transcript tab costs NO PANEL CODE (ADR-018 D2).
 *
 * "With the preference on, case detail is proven to load no panel code at all:
 * no package chunk, no session, no transcript-panel mount." That is a
 * requirement about the MODULE GRAPH, not about the screen — a test asserting
 * only "no panel is visible" would pass on a build that downloaded, evaluated
 * and initialised the whole shared UI behind a tab the user never opens, which
 * is exactly what faultmaven-dashboard#124 did on every case-detail view
 * whatever tab was active.
 *
 * So the assertion is the same one `panelNotBeforeSignIn.test.tsx` makes, at a
 * different boundary: the counter below increments the first time anything
 * imports `@faultmaven/copilot-ui` at runtime, and on the read-only arm it must
 * still be zero.
 *
 * IT HAS TO BE ITS OWN FILE. A module import is cached for the lifetime of a
 * test file, so a single live-arm render anywhere in the same file would pay
 * the import once and leave this counter at 1 forever after — the assertion
 * would then be measuring test order rather than the build. The second test is
 * this one's own failure state: without it, a mount that had been deleted or
 * renamed would keep the first test green for the wrong reason.
 */

/**
 * `vi.hoisted`, not a top-level `let`.
 *
 * `vi.mock` factories are hoisted above this file's own bindings and evaluated
 * during module loading, so a factory closing over a plain `let` throws
 * `Cannot access 'X' before initialization` the moment anything in the static
 * graph imports a value from the mocked module. That is not hypothetical — the
 * sibling page test hit exactly this when its fixtures moved into a factory.
 */
const pkg = vi.hoisted(() => ({ imports: 0 }));

vi.mock('@faultmaven/copilot-ui', () => {
  pkg.imports += 1;
  return {
    setHostStore: vi.fn(),
    setHostEndpoints: vi.fn(),
    setApiTransport: vi.fn(),
    clearApiTransport: vi.fn(),
    clearPersistedSession: vi.fn().mockResolvedValue(undefined),
    CopilotPanel: () => <div data-testid="shared-copilot-ui">shared UI</div>,
  };
});

vi.mock('../../lib/api', () => ({
  getCaseMessages: vi.fn().mockResolvedValue({
    messages: [
      {
        message_id: 'm1',
        turn_number: 1,
        role: 'user',
        content: 'Writes started failing at 02:14.',
        created_at: '2026-01-01T02:14:00Z',
        author_id: 'u1',
        token_count: null,
        metadata: {},
      },
    ],
    total_count: 1,
  }),
  getUploadedFiles: vi.fn().mockResolvedValue({ files: [] }),
  getUploadedFileDetails: vi.fn().mockResolvedValue(null),
  getCaseEvidenceList: vi.fn().mockResolvedValue({
    evidence: [
      {
        evidence_id: 'e1',
        category: 'metric',
        summary: 'Pool waits hit 900/min',
        extract: null,
        analysis: null,
        collected_at_turn: 1,
        source_file: null,
        related_hypotheses: [],
      },
    ],
  }),
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

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ authState: { user: { user_id: 'someone-else' } } }),
}));

vi.mock('../../config', () => ({
  default: { apiUrl: 'https://api.faultmaven.ai', inputLimits: {} },
}));

import { CaseTabs } from '../../components/CaseTabs';
import { LAYOUTS } from '../support/caseConversationLayout';
import type { CaseConversationLayout } from '../../lib/cases/conversationSurface';

const CASE: CaseDetail = {
  case_id: 'case-9',
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

function renderTabs(tab: string, layout: CaseConversationLayout = LAYOUTS.nonOwner) {
  return render(
    <MemoryRouter initialEntries={[`/?tab=${tab}`]}>
      <CaseTabs caseId={CASE.case_id} caseDetail={CASE} layout={layout} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // The arm is chosen per render by the LAYOUT now, not by module state, so
  // nothing here can leak between tests. `pkg.imports` is deliberately NOT
  // reset: it is cumulative, and it is the whole measurement.
  localStorage.clear();
});

describe('the read-only Transcript tab', () => {
  it('reads the conversation without importing the shared UI at all', async () => {
    // Ordered first deliberately, and the only test in this file that renders
    // the read-only arm — see the header for why the file exists.
    const { unmount } = renderTabs('transcript');
    await waitFor(() =>
      expect(screen.getByText(/Writes started failing at 02:14/)).toBeInTheDocument(),
    );

    expect(pkg.imports).toBe(0);

    // And not merely because nothing has settled yet. The tab strip renders
    // synchronously, so awaiting a BUTTON would prove nothing — this waits for
    // content that only exists once the Evidence tab's own fetch has resolved,
    // which is the latest point at which a lazy import could still have fired.
    unmount();
    renderTabs('evidence');
    await waitFor(() => expect(screen.getByText('Pool waits hit 900/min')).toBeInTheDocument());
    expect(pkg.imports).toBe(0);
  });

  it('and the live arm DOES import it — so the assertion above is not vacuous', async () => {
    renderTabs('transcript', LAYOUTS.narrowOwner);

    await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());
    expect(pkg.imports).toBe(1);
  });
});
