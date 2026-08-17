import type { CaseState, InvestigationStage } from '../types/cases';

/**
 * Number of turns without progress at which a case reads as stalled rather
 * than merely slow.
 *
 * Lives here because this component is the single renderer of stalled-ness —
 * both case tables and the case detail header go through it, so the threshold
 * cannot drift between the list and the page it opens.
 */
export const STALLED_TURN_THRESHOLD = 5;

interface CaseStageCellProps {
  /** Case lifecycle state — decides whether a stage is meaningful at all. */
  state: CaseState;
  /** Investigation stage. Null outside INVESTIGATING, which the server guarantees. */
  stage: InvestigationStage | null;
  /** Consecutive turns that produced no progress. */
  turnsWithoutProgress: number;
}

/**
 * Display labels for `InvestigationStage`.
 *
 * Owned here rather than taken from the backend on purpose. The backend has a
 * `stage_display_name` property, but it renders DIAGNOSIS as "Investigating" —
 * which collides with `CaseState.investigating` and would make most rows read
 * `Investigating / Investigating`. That property also feeds LLM prompt
 * construction and nothing else, so binding a UI label to it would mean a
 * wording fix here perturbs investigation prompts (faultmaven#1075).
 *
 * So the wire carries the enum and the UI names it, exactly as `CaseStateBadge`
 * already does for `CaseState`.
 */
const stageLabels: Record<InvestigationStage, string> = {
  diagnosis: 'Diagnosing',
  mitigation: 'Mitigating',
  treatment: 'Resolving',
};

/**
 * The "Stage" cell: where an investigation stands, and whether it is moving.
 *
 * Replaces a `completed/total` milestone bar that could not be made correct.
 * Milestones complete opportunistically and four of the seven sit on mutually
 * alternative resolution paths, so there is no fixed total to divide by — every
 * candidate denominator made the bar *fall* when a case entered the mitigation
 * path. Stage and stalled-ness are the two facts the fraction was reaching for
 * and neither needs one.
 *
 * Stalled-ness is rendered as a modifier on the stage, not in place of it: a
 * case that is stuck is still somewhere, and "where" is the column's subject.
 */
export function CaseStageCell({ state, stage, turnsWithoutProgress }: CaseStageCellProps) {
  // A stage is only meaningful while a case is being investigated, so every
  // other row is muted rather than captioned. Three situations reach this, and
  // an em dash is the right answer to all of them:
  //
  //   RESOLVED / CLOSED — no live stage, and the State column already reports
  //     how the case ended; captioning it here would just repeat that.
  //   INQUIRY — the case may not describe a problem at all, it can be a plain
  //     question. Wording it as though troubleshooting were pending ("Not
  //     started") asserts work that may never have been owed.
  //   stage absent on an investigating case — version skew. Image tags move
  //     independently (FM_DASHBOARD_IMAGE_TAG vs FM_IMAGE_TAG), so a dashboard
  //     built after faultmaven#1076 can meet an API that never sends `stage`;
  //     it arrives as undefined, which a `=== null` test would miss.
  //
  // The dash claims nothing, which is exactly what is true in each case.
  if (state !== 'investigating' || !stage) {
    return <span className="text-fm-text-tertiary">—</span>;
  }

  const stalled = turnsWithoutProgress >= STALLED_TURN_THRESHOLD;

  return (
    <span
      className={stalled ? 'text-fm-warning' : 'text-fm-text-secondary'}
      title={stalled ? `No progress for ${turnsWithoutProgress} turns` : undefined}
    >
      {/* Fall back to the raw enum value, not the em dash. A newer API can send
          a stage this bundle has no label for — the mirror of the absent-stage
          case above, since the image tags move independently in both
          directions. An em dash here would claim the case has no stage, which
          is false: it has one, we just cannot name it. Showing the value keeps
          the row truthful and makes the skew visible instead of hiding it. */}
      {stageLabels[stage] ?? stage}
      {stalled && (
        <span className="text-xs"> · stalled {turnsWithoutProgress}t</span>
      )}
    </span>
  );
}
