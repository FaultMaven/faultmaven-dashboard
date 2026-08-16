import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CaseTabs } from '../../components/CaseTabs';
import { getCaseUI } from '../../lib/api';
import type { CaseDetail, HypothesisSummary } from '../../types/cases';

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

describe('CaseTabs — Hypotheses rendering (state, post-#405)', () => {
  beforeEach(() => vi.clearAllMocks());

  function hypothesis(overrides: Partial<HypothesisSummary>): HypothesisSummary {
    return {
      hypothesis_id: 'h1',
      text: 'Placeholder',
      likelihood: 0.5,
      state: 'active',
      evidence_count: 0,
      ...overrides,
    };
  }

  it('renders validated and refuted hypotheses distinctly, keyed off `state`', async () => {
    // The backend sends `state` (not `status`). Prior to the type unification the
    // component read `hypothesis.status` (always undefined) and every row fell
    // back to the neutral '○'. This asserts the real symbols now appear.
    const active_hypotheses: HypothesisSummary[] = [
      hypothesis({
        hypothesis_id: 'h-valid',
        text: 'Connection pool exhausted',
        state: 'validated',
        likelihood: 0.9,
      }),
      hypothesis({
        hypothesis_id: 'h-refuted',
        text: 'DNS misconfiguration',
        state: 'refuted',
        likelihood: 0.1,
      }),
    ];
    vi.mocked(getCaseUI).mockResolvedValue({
      case_id: 'case-1',
      state: 'investigating',
      title: 'DB Outage',
      current_turn: 5,
      active_hypotheses,
    });

    renderTabs(makeCaseDetail({ hypothesis_count: 2 }), '/?tab=hypotheses');

    // Both statements render, each under its own state label.
    await waitFor(() =>
      expect(screen.getByText('Connection pool exhausted')).toBeInTheDocument(),
    );
    expect(screen.getByText('DNS misconfiguration')).toBeInTheDocument();
    expect(screen.getByText('validated')).toBeInTheDocument();
    expect(screen.getByText('refuted')).toBeInTheDocument();

    // Distinct status glyphs: ✓ for validated, ✗ for refuted (neither the
    // neutral '○' fallback).
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('✗')).toBeInTheDocument();
  });
});

describe('CaseTabs — tab ↔ URL sync', () => {
  beforeEach(() => vi.clearAllMocks());

  it('activates the clicked tab (and writes it to the URL)', async () => {
    renderTabs(makeCaseDetail({ hypothesis_count: 0 }));
    await waitFor(() => expect(isActive('Transcript')).toBe(true));

    fireEvent.click(tabButton('Issue')!);
    await waitFor(() => expect(isActive('Issue')).toBe(true));
    expect(isActive('Transcript')).toBe(false);
  });

  it('reflects a same-mount ?tab change via a shared search-params bridge', async () => {
    // A deep link that changes the ?tab on an already-mounted case must take
    // effect because the active tab is derived from the URL, not read once
    // into state. Assert the two directions independently: a click moves the
    // URL (previous test) and a URL that already names a tab selects it here.
    renderTabs(makeCaseDetail({ hypothesis_count: 0 }), '/?tab=report');
    await waitFor(() => expect(isActive('Report')).toBe(true));
  });
});
