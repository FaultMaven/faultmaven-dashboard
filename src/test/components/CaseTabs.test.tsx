import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CaseTabs } from '../../components/CaseTabs';
import type { CaseDetail } from '../../types/cases';

// Only the active tab fetches; mock every client CaseTabs may touch so no tab
// throws on mount regardless of which one ends up active.
vi.mock('../../lib/api', () => ({
  getCaseMessages: vi.fn().mockResolvedValue([]),
  getUploadedFiles: vi.fn().mockResolvedValue([]),
  getUploadedFileDetails: vi.fn().mockResolvedValue(null),
  getCaseEvidenceList: vi.fn().mockResolvedValue([]),
  getCaseUI: vi.fn().mockResolvedValue({ active_hypotheses: [] }),
}));

function makeCaseDetail(overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
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
    total_milestones: 5,
    is_archived: false,
    is_stuck: false,
    is_terminal: false,
    turns_without_progress: 0,
    current_stage: null,
    milestones_completed: [],
    pending_milestones: [],
    evidence_count: 0,
    hypothesis_count: 0,
    solution_count: 0,
    degraded_mode_active: false,
    escalated: false,
    ...overrides,
  };
}

function renderTabs(caseDetail: CaseDetail, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <CaseTabs caseId={caseDetail.case_id} caseDetail={caseDetail} />
    </MemoryRouter>
  );
}

const tabButton = (name: string) => screen.queryByRole('button', { name });
const isActive = (name: string) => tabButton(name)?.className.includes('border-fm-accent');

describe('CaseTabs — Hypotheses tab visibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the Hypotheses tab when the case has hypotheses', async () => {
    renderTabs(makeCaseDetail({ hypothesis_count: 3 }));
    await waitFor(() => expect(tabButton('Hypotheses')).toBeInTheDocument());
  });

  it('hides the Hypotheses tab when the case has no hypotheses', async () => {
    renderTabs(makeCaseDetail({ hypothesis_count: 0 }));
    // The other four tabs remain; Hypotheses is dropped.
    await waitFor(() => expect(tabButton('Transcript')).toBeInTheDocument());
    expect(tabButton('Hypotheses')).not.toBeInTheDocument();
    ['Issue', 'Report', 'Evidence'].forEach((label) =>
      expect(tabButton(label)).toBeInTheDocument(),
    );
  });

  it('keeps the tab on terminal cases that deliberated (count spans lifecycle)', async () => {
    renderTabs(makeCaseDetail({ hypothesis_count: 2, is_terminal: true, state: 'resolved' }));
    await waitFor(() => expect(tabButton('Hypotheses')).toBeInTheDocument());
  });

  it('honors a deep link to the Hypotheses tab when it is visible', async () => {
    renderTabs(makeCaseDetail({ hypothesis_count: 2 }), '/?tab=hypotheses');
    await waitFor(() => expect(isActive('Hypotheses')).toBe(true));
  });

  it('falls back to Transcript when deep-linking a hidden Hypotheses tab', async () => {
    renderTabs(makeCaseDetail({ hypothesis_count: 0 }), '/?tab=hypotheses');
    await waitFor(() => expect(isActive('Transcript')).toBe(true));
    expect(tabButton('Hypotheses')).not.toBeInTheDocument();
  });

  it('falls back to Transcript for an unknown tab param', async () => {
    renderTabs(makeCaseDetail({ hypothesis_count: 3 }), '/?tab=bogus');
    await waitFor(() => expect(isActive('Transcript')).toBe(true));
  });
});
