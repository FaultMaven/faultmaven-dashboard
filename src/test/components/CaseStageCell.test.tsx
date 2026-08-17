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

  it('mutes the stage for an INQUIRY case', () => {
    // The bug this component replaced rendered an empty progress bar here,
    // implying an investigation underway that had achieved nothing. A caption
    // would be wrong for the opposite reason: an inquiry may be a plain
    // question with no troubleshooting owed, so the cell claims nothing.
    renderCell('inquiry', null);
    expect(screen.getByText('—')).toBeInTheDocument();
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

  it('mutes an INQUIRY case even if a stage is somehow supplied', () => {
    // The server nulls current_stage outside INVESTIGATING, so in practice an
    // inquiry row arrives with no stage and the absent-stage branch would mute
    // it anyway. Asserted independently so the rule stands on the STATE, not on
    // a null that happens to accompany it — otherwise the inquiry decision is
    // only tested by accident and a later refactor could drop it unnoticed.
    renderCell('inquiry', 'diagnosis');
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('Diagnosing')).not.toBeInTheDocument();
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

  it('does not report an INQUIRY case as stalled', () => {
    // NOT because the counter stays at zero — milestone_engine increments
    // turns_without_progress on every non-progress turn regardless of state, so
    // a long-running INQUIRY genuinely accumulates them.
    //
    // Only INVESTIGATING cases can stall. An INQUIRY case may not describe a
    // problem at all — it can be a plain question — so there is nothing for it
    // to be stuck on, and calling it stalled would assert a troubleshooting
    // failure that may not exist. Do not "fix" this by counting inquiry turns.
    renderCell('inquiry', null, 99);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/stalled/)).not.toBeInTheDocument();
  });

  it('claims nothing when an older API omits stage entirely', () => {
    // Version skew: image tags are pinned independently, so a dashboard built
    // after faultmaven#1076 can meet an API that never sends `stage`. It arrives
    // as undefined, not null, so a `=== null` test would miss it and the cell
    // would fall through and render blank.
    render(
      <CaseStageCell
        state="investigating"
        stage={undefined as unknown as InvestigationStage | null}
        turnsWithoutProgress={0}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('names an unrecognised stage rather than going blank', () => {
    // The mirror of the older-API case above. Image tags move independently in
    // both directions, so a bundle can also be OLDER than the API and meet a
    // stage it has no label for. Without a fallback the lookup is undefined and
    // the cell renders empty — and on a stalled row that leaves an orphaned
    // "· stalled 7t" with nothing in front of it.
    render(
      <CaseStageCell
        state="investigating"
        stage={'escalation' as unknown as InvestigationStage}
        turnsWithoutProgress={7}
      />
    );
    // The raw value, not an em dash: the case HAS a stage, so claiming it has
    // none would be false. The stalled signal still stands on its own.
    expect(screen.getByText(/escalation/)).toBeInTheDocument();
    expect(screen.getByText(/stalled 7t/)).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('pins the stalled threshold to an absolute value', () => {
    // Asserting against the constant would be vacuous — it would follow any
    // edit. The detail header used this same number before this component
    // existed; changing it is a deliberate product decision, not a refactor.
    expect(STALLED_TURN_THRESHOLD).toBe(5);
  });
});
