import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    organization_id: 'org1',
    current_turn: 5,
    total_milestones: 5,
    is_terminal: true,
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
});
