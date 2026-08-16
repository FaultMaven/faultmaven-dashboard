import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaseStageCell, STALLED_TURN_THRESHOLD } from '../../components/CaseStageCell';
import type { CaseState, InvestigationStage } from '../../types/cases';

function renderCell(
  state: CaseState,
  stage: InvestigationStage | null,
  turnsWithoutProgress = 0
) {
  return render(
    <CaseStageCell state={state} stage={stage} turnsWithoutProgress={turnsWithoutProgress} />
  );
}

describe('CaseStageCell', () => {
  it('names each investigation stage', () => {
    const { rerender } = renderCell('investigating', 'diagnosis');
    expect(screen.getByText('Diagnosing')).toBeInTheDocument();

    rerender(
      <CaseStageCell state="investigating" stage="mitigation" turnsWithoutProgress={0} />
    );
    expect(screen.getByText('Mitigating')).toBeInTheDocument();

    rerender(
      <CaseStageCell state="investigating" stage="treatment" turnsWithoutProgress={0} />
    );
    expect(screen.getByText('Resolving')).toBeInTheDocument();
  });

  it('does not label a stage "Investigating", which would collide with the state', () => {
    // The backend's own stage_display_name renders DIAGNOSIS as "Investigating"
    // (faultmaven#1075). Reusing it would make rows read State: Investigating /
    // Stage: Investigating. The UI owns its labels precisely to avoid that.
    renderCell('investigating', 'diagnosis');
    expect(screen.queryByText('Investigating')).not.toBeInTheDocument();
  });

  it('reports INQUIRY as not started rather than as zero progress', () => {
    // The bug this component replaced rendered an empty progress bar here,
    // implying an investigation underway that had achieved nothing.
    renderCell('inquiry', null);
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('shows no stage for terminal cases', () => {
    // A resolved case previously rendered "5/8" — complete work shown as
    // two-thirds done. The State column already reports the outcome.
    for (const state of ['resolved', 'closed'] as const) {
      const { unmount } = renderCell(state, null);
      expect(screen.getByText('—')).toBeInTheDocument();
      unmount();
    }
  });

  it('shows no stage for a terminal case even if a stage is still supplied', () => {
    // Terminal-ness wins over stage: the server nulls current_stage outside
    // INVESTIGATING, but the cell must not depend on that to stay correct.
    renderCell('resolved', 'treatment');
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('Resolving')).not.toBeInTheDocument();
  });

  it('marks a case stalled at the threshold, keeping the stage visible', () => {
    renderCell('investigating', 'mitigation', STALLED_TURN_THRESHOLD);
    // Stalled-ness annotates the stage rather than replacing it — a stuck case
    // is still somewhere, and where it is stuck is the useful part.
    expect(screen.getByText('Mitigating')).toBeInTheDocument();
    expect(screen.getByText(/stalled 5t/)).toBeInTheDocument();
  });

  it('does not mark a case stalled just below the threshold', () => {
    renderCell('investigating', 'diagnosis', STALLED_TURN_THRESHOLD - 1);
    expect(screen.getByText('Diagnosing')).toBeInTheDocument();
    expect(screen.queryByText(/stalled/)).not.toBeInTheDocument();
  });

  it('never reports a stalled INQUIRY case, which has no turns to stall on', () => {
    renderCell('inquiry', null, 99);
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.queryByText(/stalled/)).not.toBeInTheDocument();
  });

  it('pins the stalled threshold to an absolute value', () => {
    // Asserting against the constant would be vacuous — it would follow any
    // edit. The detail header used this same number before this component
    // existed; changing it is a deliberate product decision, not a refactor.
    expect(STALLED_TURN_THRESHOLD).toBe(5);
  });
});
