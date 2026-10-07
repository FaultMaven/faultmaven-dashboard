import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../lib/api', () => ({ getCaseUI: vi.fn() }));

import { getCaseUI } from '../../lib/api';
import { IssueTab } from '../../components/IssueTab';
import type { CaseDetail } from '../../types/cases';

function makeCaseDetail(overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    case_id: 'case-1',
    title: 'DB Outage',
    description: 'Primary DB unresponsive',
    state: 'resolved',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    last_activity_at: '2024-01-02T00:00:00Z',
    resolved_at: '2024-01-01T02:00:00Z',
    closed_at: null,
    closure_reason: null,
    user_id: 'u1',
    enterprise_id: 'ent-1',
    current_turn: 5,
    source: 'copilot',
    is_terminal: true,
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

describe('IssueTab status colour', () => {
  it('renders a resolved case status in success-green', () => {
    render(<IssueTab caseDetail={makeCaseDetail({ state: 'resolved' })} />);
    expect(screen.getByText('resolved')).toHaveClass('text-fm-success');
  });

  it('does not paint a closed (not necessarily resolved) case green', () => {
    render(<IssueTab caseDetail={makeCaseDetail({ state: 'closed', resolved_at: null })} />);
    const status = screen.getByText('closed');
    expect(status).not.toHaveClass('text-fm-success');
    expect(status).toHaveClass('text-fm-text-primary');
  });

  it('reads "Identified" from the backend milestone name, not from a local guess', () => {
    // `milestones_completed` is the CaseDetail field, which the backend fills
    // from `CaseProgress.completed_milestones` — a DERIVED map whose
    // `root_cause_identified` entry is `cause_state == IDENTIFIED`. #675/INV-35
    // retired the LLM-claimed milestone of the same name, and dashboard#128
    // read that as "the label is always Not identified"; it is not, because the
    // case-level snapshot was rewired to the derivation. This pins the reading
    // in both directions so the name cannot go quiet unnoticed — every fixture
    // in this file previously passed `milestones_completed: []`, so the label
    // had no coverage at all and a real regression here would have been silent.
    render(<IssueTab caseDetail={makeCaseDetail({ milestones_completed: ['root_cause_identified'] })} />);
    expect(screen.getByText('Identified')).toBeInTheDocument();
    expect(screen.queryByText('Not identified')).not.toBeInTheDocument();
  });

  it('reads "Not identified" when the engine has not identified a cause', () => {
    // CANDIDATES and UNKNOWN both land here: the backend map emits the name
    // only for IDENTIFIED, so the absence is the signal.
    render(<IssueTab caseDetail={makeCaseDetail({ milestones_completed: ['symptom_verified'] })} />);
    expect(screen.getByText('Not identified')).toBeInTheDocument();
  });

  it('reads the solution label from solution_verified', () => {
    render(<IssueTab caseDetail={makeCaseDetail({ milestones_completed: ['solution_verified'] })} />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.queryByText('Not verified')).not.toBeInTheDocument();
  });

  it('reads "Not verified" when the solution milestone is absent', () => {
    // The negative direction of the same label: `solution_accepted` is a
    // different milestone and must not satisfy it.
    render(<IssueTab caseDetail={makeCaseDetail({ milestones_completed: ['solution_accepted'] })} />);
    expect(screen.getByText('Not verified')).toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });

  it('survives a response with no milestones array at all', () => {
    // `milestones_completed` is required in the generated contract, but the
    // component carries a `|| []` fallback for it. Exercise that path rather
    // than leaving the only guard against a crash untested.
    const detail = makeCaseDetail();
    delete (detail as { milestones_completed?: unknown }).milestones_completed;
    render(<IssueTab caseDetail={detail} />);
    expect(screen.getByText('Not identified')).toBeInTheDocument();
    expect(screen.getByText('No milestones recorded.')).toBeInTheDocument();
  });

  it('renders the closure reason as meaning, not as an enum key', () => {
    // The Dashboard showed the raw value under a "Resolution Notes" heading —
    // a classification presented as if it were a sentence someone wrote, on a
    // field only ever set for CLOSED cases.
    render(
      <IssueTab
        caseDetail={makeCaseDetail({
          state: 'closed',
          resolved_at: null,
          closed_at: '2024-01-01T02:00:00Z',
          closure_reason: 'closed_rca_infeasible',
        })}
      />,
    );

    expect(screen.getByText('Closure Reason')).toBeInTheDocument();
    expect(screen.getByText('Root cause unreachable')).toBeInTheDocument();
    expect(screen.queryByText('closed_rca_infeasible')).not.toBeInTheDocument();
    expect(screen.queryByText('Resolution Notes')).not.toBeInTheDocument();
  });
});

// #296's Dashboard counterpart: `GET /cases/{id}` carries no verification, so an
// INVESTIGATING case reads it from the case's UI view.
describe('IssueTab problem statement against problem_status', () => {
  beforeEach(() => {
    // A block, not an expression: a function returned from beforeEach is run as
    // a teardown, and the reset returns the mock itself.
    vi.mocked(getCaseUI).mockReset();
  });

  it('strikes a statement the evidence showed was not present, with the finding', async () => {
    vi.mocked(getCaseUI).mockResolvedValue({
      problem_statement: 'Primary DB unresponsive',
      problem_verification: {
        problem_status: 'invalidated',
        invalidation_finding: 'Health checks passed throughout the window.',
      },
    } as never);
    render(<IssueTab caseDetail={makeCaseDetail({ state: 'investigating', is_terminal: false })} />);

    expect(await screen.findByText('Not present: Health checks passed throughout the window.')).toBeInTheDocument();
    expect(screen.getByText('Primary DB unresponsive')).toHaveClass('line-through');
    expect(getCaseUI).toHaveBeenCalledWith('case-1');
  });

  it('reads no verification for a terminal case', () => {
    render(<IssueTab caseDetail={makeCaseDetail({ state: 'closed' })} />);
    expect(getCaseUI).not.toHaveBeenCalled();
    expect(screen.getByText('Primary DB unresponsive')).not.toHaveClass('line-through');
  });

  it('keeps the description when the UI view cannot be read', async () => {
    vi.mocked(getCaseUI).mockRejectedValue(new Error('offline'));
    render(<IssueTab caseDetail={makeCaseDetail({ state: 'investigating', is_terminal: false })} />);
    await waitFor(() => expect(getCaseUI).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText('Primary DB unresponsive')).not.toHaveClass('line-through');
    expect(screen.queryByText(/Not present/)).toBeNull();
  });
});
