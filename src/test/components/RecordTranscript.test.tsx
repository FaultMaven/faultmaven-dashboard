import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { CaseDetail } from '../../types/cases';

/**
 * The READ-ONLY arm of the Transcript tab, rendering the REAL `TranscriptView`.
 *
 * Its siblings cannot cover this. `CaseTabsTranscript.test.tsx` stubs
 * `TranscriptView`, so an empty transcript and a failed load are invisible to
 * it; `CaseDetailConversation.test.tsx` renders the whole page and cannot move
 * the route from one case to the next without a real router history.
 *
 * WHAT IT EXISTS FOR. The stale-error fix in `RecordTranscriptTab` — clearing
 * `error` at the top of every attempt — is bound HERE and nowhere else.
 * `CaseTabs` carries no `key` on the route's `:caseId`, so its instance
 * survives a move between cases and the error guard wins over loaded messages:
 * without the fix, one failed load shows its error over every later case's
 * transcript for as long as the page stays open. That binding was lost for one
 * commit when the file holding it was deleted, and the whole suite stayed green
 * with the fix removed.
 */

vi.mock('../../lib/api', () => ({
  getCaseMessages: vi.fn(),
  getUploadedFiles: vi.fn().mockResolvedValue({ files: [] }),
  getUploadedFileDetails: vi.fn().mockResolvedValue(null),
  getCaseEvidenceList: vi.fn().mockResolvedValue({ evidence: [] }),
  getCaseUI: vi.fn().mockResolvedValue({ active_hypotheses: [] }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ authState: { user: { user_id: 'someone-else' } } }),
}));

import { CaseTabs } from '../../components/CaseTabs';
import { LAYOUTS } from '../support/caseConversationLayout';
import { getCaseMessages } from '../../lib/api';

const CASE: CaseDetail = {
  case_id: 'case-1',
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

const MESSAGE = {
  message_id: 'm1',
  turn_number: 1,
  role: 'user',
  content: 'The primary replica stopped accepting writes at 02:14.',
  created_at: '2026-01-01T02:14:00Z',
  author_id: 'owner-1',
  token_count: null,
  metadata: {},
};

function renderRecord(caseId = CASE.case_id) {
  return render(
    <MemoryRouter initialEntries={['/?tab=transcript']}>
      <CaseTabs
        caseId={caseId}
        caseDetail={{ ...CASE, case_id: caseId }}
        layout={LAYOUTS.nonOwner}
        readOnly
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the read-only transcript', () => {
  it('renders the conversation', async () => {
    vi.mocked(getCaseMessages).mockResolvedValue({ messages: [MESSAGE], total_count: 1 } as never);
    renderRecord();

    await waitFor(() =>
      expect(screen.getByText(/stopped accepting writes at 02:14/)).toBeInTheDocument(),
    );
  });

  it('says so when there is nothing to read yet, rather than rendering blank', async () => {
    vi.mocked(getCaseMessages).mockResolvedValue({ messages: [], total_count: 0 } as never);
    renderRecord();

    await waitFor(() => expect(screen.getByText('No messages yet.')).toBeInTheDocument());
  });

  it('reports a failed load rather than an empty transcript', async () => {
    // The two are very different facts and must not look the same: "there is
    // nothing here" and "we could not find out" send a user to opposite places.
    vi.mocked(getCaseMessages).mockRejectedValue(new Error('Failed to get case messages'));
    renderRecord();

    await waitFor(() =>
      expect(screen.getByText('Failed to get case messages')).toBeInTheDocument(),
    );
    expect(screen.queryByText('No messages yet.')).not.toBeInTheDocument();
  });

  it('survives a tab switch without re-fetching the whole transcript', async () => {
    // `getCaseMessages` PAGES at 100 messages a request, so an unmount on every
    // tab change cost a long case several sequential round trips and a
    // "Loading transcript…" flash each time someone glanced at Evidence and
    // came back. Measured before the fix: 1 call → 2. It is hidden rather than
    // unmounted now, exactly as the live arm is and for the same reason.
    vi.mocked(getCaseMessages).mockResolvedValue({ messages: [MESSAGE], total_count: 1 } as never);
    renderRecord();
    await waitFor(() =>
      expect(screen.getByText(/stopped accepting writes at 02:14/)).toBeInTheDocument(),
    );
    expect(getCaseMessages).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Evidence' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Evidence' }).className).toContain('text-fm-accent'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }));
    await waitFor(() =>
      expect(screen.getByText(/stopped accepting writes at 02:14/)).toBeInTheDocument(),
    );

    expect(getCaseMessages).toHaveBeenCalledTimes(1);
  });

  it('does NOT poison the next case with the last one’s error', async () => {
    // `CaseTabs` has no `key` on `:caseId`, so this instance survives the move
    // and the error guard wins over loaded messages. Deleting the `setError(null)`
    // that opens each attempt makes this test — and only this test — fail.
    vi.mocked(getCaseMessages)
      .mockRejectedValueOnce(new Error('Failed to get case messages'))
      .mockResolvedValue({ messages: [MESSAGE], total_count: 1 } as never);

    const { rerender } = renderRecord('case-1');
    await waitFor(() =>
      expect(screen.getByText('Failed to get case messages')).toBeInTheDocument(),
    );

    rerender(
      <MemoryRouter initialEntries={['/?tab=transcript']}>
        <CaseTabs
          caseId="case-2"
          caseDetail={{ ...CASE, case_id: 'case-2' }}
          layout={LAYOUTS.nonOwner}
          readOnly
        />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText(/stopped accepting writes at 02:14/)).toBeInTheDocument(),
    );
    expect(screen.queryByText('Failed to get case messages')).not.toBeInTheDocument();
  });
});
