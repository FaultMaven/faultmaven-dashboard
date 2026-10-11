import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type {
  CaseDetail,
  CaseEvidenceListResponse,
  CaseMessage,
  CaseMessagesResponse,
  CaseUIResponse,
  EvidenceDetails,
  HypothesisSummary,
  UploadedFile,
  UploadedFileDetails,
  UploadedFilesResponse,
} from '../../types/cases';
import type { CaseConversationLayout } from '../../lib/cases/conversationSurface';

/**
 * The tabs that read for themselves follow the case's REVISION (#206).
 *
 * The docked panel commits turns while Evidence or Hypotheses is on screen, and
 * the page re-reads `caseDetail` when it does (#204, #205). These tabs fetched
 * on `caseId` alone and so went stale until the user switched tabs. The page is
 * modelled here by re-rendering `CaseTabs` with a newer `updated_at`.
 *
 * Every read has REAL latency. A zero-latency mock coalesces the in-flight
 * render away, and with it the "Loading…" flash a background read must not
 * cause — which is exactly what several tests below assert is absent.
 */

vi.mock('../../lib/api', () => ({
  getCaseMessages: vi.fn(),
  getUploadedFiles: vi.fn(),
  getUploadedFileDetails: vi.fn(),
  getCaseEvidenceList: vi.fn(),
  getCaseUI: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ authState: { user: { user_id: 'u1' } } }),
}));

import { CaseTabs } from '../../components/CaseTabs';
import { LAYOUTS } from '../support/caseConversationLayout';
import {
  getCaseEvidenceList,
  getCaseMessages,
  getCaseUI,
  getUploadedFileDetails,
  getUploadedFiles,
} from '../../lib/api';

const LATENCY = 30;
const after = <T,>(body: T, ms = LATENCY): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(body), ms));
const failAfter = (message: string, ms = LATENCY): Promise<never> =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
/** Let real time pass, so every read in flight has landed. */
const settle = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

const REV_1 = '2026-10-01T10:00:00.000001Z';
const REV_2 = '2026-10-01T10:01:00.000001Z';
const REV_3 = '2026-10-01T10:02:00.000001Z';

function caseDetail(overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    case_id: 'case-1',
    title: 'Replica stopped accepting writes',
    description: 'Writes fail, reads succeed',
    state: 'investigating',
    created_at: '2026-10-01T09:00:00Z',
    updated_at: REV_1,
    last_activity_at: '2026-10-01T10:00:00Z',
    resolved_at: null,
    closed_at: null,
    closure_reason: null,
    user_id: 'u1',
    enterprise_id: 'ent-1',
    current_turn: 3,
    source: 'copilot',
    is_terminal: false,
    turns_without_progress: 0,
    current_stage: null,
    milestones_completed: [],
    pending_milestones: [],
    evidence_count: 1,
    hypothesis_count: 1,
    solution_count: 0,
    escalated: false,
    ...overrides,
  };
}

function evidence(id: string, summary: string, extract: string): EvidenceDetails {
  return {
    case_id: 'case-1',
    evidence_id: id,
    category: 'LOGS_AND_ERRORS',
    collected_at: '2026-10-01T10:00:00Z',
    collected_at_turn: 1,
    collected_by: 'u1',
    primary_purpose: 'symptom',
    summary,
    extract,
  };
}
const evidenceList = (...items: EvidenceDetails[]): CaseEvidenceListResponse => ({
  case_id: 'case-1',
  evidence: items,
  total_count: items.length,
});

const DISK_FULL = evidence('ev-1', 'Disk full on replica', 'ENOSPC: no space left on device');
const WAL_STUCK = evidence('ev-2', 'WAL archiving stalled', 'archive_command failed');
const STALE_ROW = evidence('ev-old', 'A row from an older revision', 'old');

/** The one line a tab shows over rows a refresh could not replace. */
const STALE_NOTE = /Couldn.t refresh/;

function renderTabs(detail: CaseDetail, route: string, layout: CaseConversationLayout = LAYOUTS.docked) {
  // Same element types on every render, so `rerender` updates the mounted tree
  // (as the page does on a quiet re-read) rather than remounting it.
  const view = (d: CaseDetail) => (
    <MemoryRouter initialEntries={[route]}>
      <CaseTabs caseId={d.case_id} caseDetail={d} layout={layout} readOnly={false} />
    </MemoryRouter>
  );
  const utils = render(view(detail));
  return {
    update: (d: CaseDetail, nextLayout?: CaseConversationLayout) => {
      if (nextLayout) layout = nextLayout;
      utils.rerender(view(d));
    },
  };
}

beforeEach(() => {
  vi.mocked(getCaseEvidenceList).mockReset();
  vi.mocked(getCaseUI).mockReset();
  vi.mocked(getCaseMessages).mockReset();
  vi.mocked(getUploadedFiles).mockReset();
  vi.mocked(getUploadedFileDetails).mockReset();
});

describe('Evidence follows the case revision', () => {
  it('re-reads when the revision moves, keeping the rows and an expanded row on screen meanwhile', async () => {
    vi.mocked(getCaseEvidenceList)
      .mockImplementationOnce(() => after(evidenceList(DISK_FULL)))
      .mockImplementationOnce(() => after(evidenceList(DISK_FULL, WAL_STUCK)));
    const { update } = renderTabs(caseDetail(), '/?tab=evidence');

    fireEvent.click(await screen.findByRole('button', { name: /Disk full on replica/ }));
    expect(screen.getByText('ENOSPC: no space left on device')).toBeInTheDocument();

    update(caseDetail({ updated_at: REV_2, current_turn: 4 }));

    // In flight: nothing was swapped for a loading state, and the expanded
    // row is still expanded — checked once now and once mid-latency.
    expect(screen.queryByText('Loading evidence...')).not.toBeInTheDocument();
    expect(screen.getByText('ENOSPC: no space left on device')).toBeInTheDocument();
    await settle(LATENCY / 3);
    expect(getCaseEvidenceList).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Loading evidence...')).not.toBeInTheDocument();
    expect(screen.getByText('ENOSPC: no space left on device')).toBeInTheDocument();

    expect(await screen.findByText('WAL archiving stalled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Disk full on replica/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('ENOSPC: no space left on device')).toBeInTheDocument();
  });

  it('does not re-read when the case is re-rendered at the same revision', async () => {
    // The page hands a NEW `caseDetail` object on every re-read; only a moved
    // revision is a change. A hand-off, say, re-reads the case without one.
    vi.mocked(getCaseEvidenceList).mockImplementation(() => after(evidenceList(DISK_FULL)));
    const { update } = renderTabs(caseDetail(), '/?tab=evidence');
    expect(await screen.findByText('Disk full on replica')).toBeInTheDocument();

    update(caseDetail({ driver_display_name: 'Someone else' }));
    update(caseDetail());
    await settle(LATENCY * 2);

    expect(getCaseEvidenceList).toHaveBeenCalledTimes(1);
  });

  it('keeps the list when a background re-read fails, and says it may be out of date', async () => {
    // As `CaseDetailPage.loadCase` keeps a working page: a transient failure
    // of a refresh must not replace rows the user is reading with an error.
    // But the rows are no longer the server's latest word, so one quiet line
    // says so — silence would present them as current.
    vi.mocked(getCaseEvidenceList)
      .mockImplementationOnce(() => after(evidenceList(DISK_FULL)))
      .mockImplementationOnce(() => failAfter('Failed to list case evidence'));
    const { update } = renderTabs(caseDetail(), '/?tab=evidence');
    expect(await screen.findByText('Disk full on replica')).toBeInTheDocument();
    expect(screen.queryByText(STALE_NOTE)).not.toBeInTheDocument();

    update(caseDetail({ updated_at: REV_2 }));
    await settle(LATENCY * 3);

    expect(getCaseEvidenceList).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Disk full on replica')).toBeInTheDocument();
    expect(screen.queryByText('Failed to list case evidence')).not.toBeInTheDocument();
    expect(screen.getByText(STALE_NOTE)).toBeInTheDocument();
  });

  it('drops the out-of-date note once a later refresh succeeds', async () => {
    vi.mocked(getCaseEvidenceList)
      .mockImplementationOnce(() => after(evidenceList(DISK_FULL)))
      .mockImplementationOnce(() => failAfter('Failed to list case evidence'))
      .mockImplementationOnce(() => after(evidenceList(DISK_FULL, WAL_STUCK)));
    const { update } = renderTabs(caseDetail(), '/?tab=evidence');
    expect(await screen.findByText('Disk full on replica')).toBeInTheDocument();

    update(caseDetail({ updated_at: REV_2 }));
    expect(await screen.findByText(STALE_NOTE)).toBeInTheDocument();

    update(caseDetail({ updated_at: REV_3 }));
    expect(await screen.findByText('WAL archiving stalled')).toBeInTheDocument();
    expect(screen.queryByText(STALE_NOTE)).not.toBeInTheDocument();
    expect(getCaseEvidenceList).toHaveBeenCalledTimes(3);
  });

  it('never lets an older answer that lands late replace a newer one', async () => {
    // REV_2's read is slow and REV_3's is fast, so REV_2's lands LAST.
    vi.mocked(getCaseEvidenceList)
      .mockImplementationOnce(() => after(evidenceList(DISK_FULL)))
      .mockImplementationOnce(() => after(evidenceList(DISK_FULL, STALE_ROW), LATENCY * 4))
      .mockImplementationOnce(() => after(evidenceList(DISK_FULL, WAL_STUCK), LATENCY));
    const { update } = renderTabs(caseDetail(), '/?tab=evidence');
    expect(await screen.findByText('Disk full on replica')).toBeInTheDocument();

    update(caseDetail({ updated_at: REV_2 }));
    update(caseDetail({ updated_at: REV_3 }));
    await settle(LATENCY * 6);

    expect(getCaseEvidenceList).toHaveBeenCalledTimes(3);
    expect(screen.getByText('WAL archiving stalled')).toBeInTheDocument();
    expect(screen.queryByText('A row from an older revision')).not.toBeInTheDocument();
  });

  it('still loads a different case afresh, never showing the last case’s rows or error', async () => {
    // `CaseTabs` has no `key` on `:caseId`, so the tab survives the move. What
    // it holds is keyed by case: case-1's error must not stand over case-2,
    // and case-1's rows must not stand in for case-2's while it loads.
    vi.mocked(getCaseEvidenceList)
      .mockImplementationOnce(() => failAfter('Failed to list case evidence'))
      .mockImplementationOnce(() => after(evidenceList(WAL_STUCK)));
    const { update } = renderTabs(caseDetail(), '/?tab=evidence');
    expect(await screen.findByText('Failed to list case evidence')).toBeInTheDocument();

    update(caseDetail({ case_id: 'case-2' }));
    expect(screen.getByText('Loading evidence...')).toBeInTheDocument();
    expect(screen.queryByText('Failed to list case evidence')).not.toBeInTheDocument();

    expect(await screen.findByText('WAL archiving stalled')).toBeInTheDocument();
    expect(getCaseEvidenceList).toHaveBeenLastCalledWith('case-2');
  });

  it('shows a different case’s loading state rather than this case’s rows', async () => {
    vi.mocked(getCaseEvidenceList)
      .mockImplementationOnce(() => after(evidenceList(DISK_FULL)))
      .mockImplementationOnce(() => after(evidenceList(WAL_STUCK)));
    const { update } = renderTabs(caseDetail(), '/?tab=evidence');
    expect(await screen.findByText('Disk full on replica')).toBeInTheDocument();

    update(caseDetail({ case_id: 'case-2' }));
    expect(screen.getByText('Loading evidence...')).toBeInTheDocument();
    expect(screen.queryByText('Disk full on replica')).not.toBeInTheDocument();
    expect(await screen.findByText('WAL archiving stalled')).toBeInTheDocument();
  });
});

describe('the uploaded-file view follows the case revision', () => {
  const file = (id: string, filename: string): UploadedFile => ({
    file_id: id,
    filename,
    analysis_status: 'completed',
    size_bytes: 2048,
    size_display: '2 KB',
    source_type: 'file_upload',
    uploaded_at: '2026-10-01T10:00:00Z',
    uploaded_at_turn: 1,
  });
  const files = (...items: UploadedFile[]): UploadedFilesResponse => ({
    files: items,
    limit: 50,
    offset: 0,
    total_count: items.length,
  });
  const details = (summary: string): UploadedFileDetails => ({
    file_id: 'f-1',
    filename: 'replica.log',
    evidence_count: 0,
    size_bytes: 2048,
    size_display: '2 KB',
    upload_source: 'file_upload',
    uploaded_at: '2026-10-01T10:00:00Z',
    uploaded_at_turn: 1,
    summary,
    derived_evidence: [],
  });

  it('re-reads the list and an expanded file’s detail, quietly', async () => {
    vi.mocked(getCaseEvidenceList).mockImplementation(() => after(evidenceList()));
    vi.mocked(getUploadedFiles)
      .mockImplementationOnce(() => after(files(file('f-1', 'replica.log'))))
      .mockImplementationOnce(() => after(files(file('f-1', 'replica.log'), file('f-2', 'pg_wal.txt'))));
    vi.mocked(getUploadedFileDetails)
      .mockImplementationOnce(() => after(details('Replica log, 40 lines')))
      .mockImplementationOnce(() => after(details('Replica log, now linked to a hypothesis')));
    const { update } = renderTabs(caseDetail(), '/?tab=evidence');

    fireEvent.click(await screen.findByRole('button', { name: 'View uploaded files →' }));
    fireEvent.click(await screen.findByRole('button', { name: /replica\.log/ }));
    expect(await screen.findByText('Replica log, 40 lines')).toBeInTheDocument();

    update(caseDetail({ updated_at: REV_2 }));
    await settle(LATENCY / 3);
    expect(screen.queryByText('Loading files...')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading derived evidence...')).not.toBeInTheDocument();
    expect(screen.getByText('Replica log, 40 lines')).toBeInTheDocument();

    expect(await screen.findByText('pg_wal.txt')).toBeInTheDocument();
    expect(await screen.findByText('Replica log, now linked to a hypothesis')).toBeInTheDocument();
    expect(getUploadedFiles).toHaveBeenCalledTimes(2);
    expect(getUploadedFileDetails).toHaveBeenCalledTimes(2);
  });
});

describe('Hypotheses follow the case revision', () => {
  const hypothesis = (id: string, text: string): HypothesisSummary => ({
    hypothesis_id: id,
    text,
    likelihood: 0.6,
    state: 'active',
    evidence_count: 1,
  });
  const ui = (...active_hypotheses: HypothesisSummary[]): CaseUIResponse => ({
    case_id: 'case-1',
    state: 'investigating',
    title: 'Replica stopped accepting writes',
    current_turn: 3,
    active_hypotheses,
  });

  it('re-reads when the revision moves, without a loading flash', async () => {
    vi.mocked(getCaseUI)
      .mockImplementationOnce(() => after(ui(hypothesis('h-1', 'The volume filled up'))))
      .mockImplementationOnce(() =>
        after(ui(hypothesis('h-1', 'The volume filled up'), hypothesis('h-2', 'WAL archiving is wedged'))),
      );
    const { update } = renderTabs(caseDetail(), '/?tab=hypotheses');
    expect(await screen.findByText('The volume filled up')).toBeInTheDocument();

    update(caseDetail({ updated_at: REV_2, hypothesis_count: 2 }));
    await settle(LATENCY / 3);
    expect(screen.queryByText('Loading hypotheses...')).not.toBeInTheDocument();
    expect(screen.getByText('The volume filled up')).toBeInTheDocument();

    expect(await screen.findByText('WAL archiving is wedged')).toBeInTheDocument();
    expect(getCaseUI).toHaveBeenCalledTimes(2);
  });
});

describe('the read-only transcript follows the case revision', () => {
  const message = (id: string, turn: number, content: string): CaseMessage => ({
    message_id: id,
    turn_number: turn,
    role: 'user',
    content,
    created_at: '2026-10-01T10:00:00Z',
    author_id: 'u1',
  });
  const messages = (...items: CaseMessage[]): CaseMessagesResponse => ({
    messages: items,
    total_count: items.length,
    retrieved_count: items.length,
    has_more: false,
  });

  it('re-reads after a turn the collapsed dock committed, keeping the record on screen', async () => {
    // Reachable: a turn sent from the dock survives a collapse (the panel is
    // hidden, not unmounted) and commits behind the rail, while this record —
    // shown because the dock is collapsed — is what the user is reading.
    vi.mocked(getCaseMessages)
      .mockImplementationOnce(() => after(messages(message('m1', 1, 'Writes fail since 02:14.'))))
      .mockImplementationOnce(() =>
        after(messages(message('m1', 1, 'Writes fail since 02:14.'), message('m2', 2, 'The volume is at 100%.'))),
      );
    const { update } = renderTabs(caseDetail(), '/?tab=transcript', LAYOUTS.dockCollapsed);
    expect(await screen.findByText(/Writes fail since 02:14/)).toBeInTheDocument();

    update(caseDetail({ updated_at: REV_2, current_turn: 4 }));
    await settle(LATENCY / 3);
    expect(screen.queryByText('Loading transcript...')).not.toBeInTheDocument();
    expect(screen.getByText(/Writes fail since 02:14/)).toBeInTheDocument();

    expect(await screen.findByText(/The volume is at 100%/)).toBeInTheDocument();
    expect(getCaseMessages).toHaveBeenCalledTimes(2);
  });

  it('waits behind another tab, and catches up quietly once Transcript is shown again', async () => {
    // The record stays MOUNTED behind Evidence (hidden, so a glance away and
    // back costs nothing), and `getCaseMessages` pages 100 messages a request.
    // Following every turn from back there would make reading Evidence cost a
    // whole transcript download per turn.
    vi.mocked(getCaseEvidenceList).mockImplementation(() => after(evidenceList(DISK_FULL)));
    vi.mocked(getCaseMessages)
      .mockImplementationOnce(() => after(messages(message('m1', 1, 'Writes fail since 02:14.'))))
      .mockImplementationOnce(() =>
        after(messages(message('m1', 1, 'Writes fail since 02:14.'), message('m2', 2, 'The volume is at 100%.'))),
      );
    const { update } = renderTabs(caseDetail(), '/?tab=evidence', LAYOUTS.dockCollapsed);
    expect(await screen.findByText('Disk full on replica')).toBeInTheDocument();
    expect(await screen.findByText(/Writes fail since 02:14/)).toBeInTheDocument();
    expect(getCaseMessages).toHaveBeenCalledTimes(1);

    update(caseDetail({ updated_at: REV_2, current_turn: 4 }));
    update(caseDetail({ updated_at: REV_3, current_turn: 5 }));
    await settle(LATENCY * 3);
    expect(getCaseMessages).toHaveBeenCalledTimes(1);
    expect(getCaseEvidenceList).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }));
    await settle(LATENCY / 3);
    expect(getCaseMessages).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Loading transcript...')).not.toBeInTheDocument();
    expect(screen.getByText(/Writes fail since 02:14/)).toBeInTheDocument();

    expect(await screen.findByText(/The volume is at 100%/)).toBeInTheDocument();
    await settle(LATENCY * 2);
    expect(getCaseMessages).toHaveBeenCalledTimes(2);
  });

  it('reads once when the dock collapses behind another tab, and not again when Transcript is shown', async () => {
    // With the dock open the record is not mounted, so turns committed there
    // cost it nothing — but the revision it is held at must still follow them.
    // Otherwise the record mounted by the collapse reads the case as it is now,
    // and showing Transcript would read it a second time to "catch up".
    vi.mocked(getCaseEvidenceList).mockImplementation(() => after(evidenceList(DISK_FULL)));
    vi.mocked(getCaseMessages).mockImplementation(() =>
      after(messages(message('m1', 1, 'Writes fail since 02:14.'), message('m2', 2, 'The volume is at 100%.'))),
    );
    const { update } = renderTabs(caseDetail(), '/?tab=evidence', LAYOUTS.docked);
    expect(await screen.findByText('Disk full on replica')).toBeInTheDocument();

    update(caseDetail({ updated_at: REV_2, current_turn: 4 }));
    await settle(LATENCY * 2);
    expect(getCaseMessages).not.toHaveBeenCalled();

    update(caseDetail({ updated_at: REV_2, current_turn: 4 }), LAYOUTS.dockCollapsed);
    expect(await screen.findByText(/The volume is at 100%/)).toBeInTheDocument();
    expect(getCaseMessages).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }));
    await settle(LATENCY * 3);
    expect(getCaseMessages).toHaveBeenCalledTimes(1);
  });

  it('reads another case once, behind another tab, and not again when Transcript is shown', async () => {
    // A move to another case reads the record afresh on `caseId` anyway; the
    // revision it is held at follows, so showing Transcript buys no second read.
    vi.mocked(getCaseEvidenceList).mockImplementation(() => after(evidenceList(DISK_FULL)));
    vi.mocked(getCaseMessages)
      .mockImplementationOnce(() => after(messages(message('m1', 1, 'Writes fail since 02:14.'))))
      .mockImplementationOnce(() => after(messages(message('m9', 1, 'Checkout returns 502.'))));
    const { update } = renderTabs(caseDetail(), '/?tab=evidence', LAYOUTS.dockCollapsed);
    expect(await screen.findByText(/Writes fail since 02:14/)).toBeInTheDocument();

    update(caseDetail({ case_id: 'case-2', updated_at: REV_2 }));
    expect(await screen.findByText(/Checkout returns 502/)).toBeInTheDocument();
    expect(getCaseMessages).toHaveBeenCalledTimes(2);
    expect(getCaseMessages).toHaveBeenLastCalledWith('case-2');

    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }));
    await settle(LATENCY * 3);
    expect(getCaseMessages).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Checkout returns 502/)).toBeInTheDocument();
  });
});
