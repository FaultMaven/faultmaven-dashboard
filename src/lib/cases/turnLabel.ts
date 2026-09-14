/**
 * Which turn this app PRINTS — the Dashboard's door to the shared rules.
 *
 * The rules live in `@faultmaven/copilot-ui/turn-label` because the Dashboard
 * and the panel render the same case on the same page, and two answers to
 * "which number do I print" is two numbers for one exchange. That is the defect
 * API contract 3.5.0 exists to end (faultmaven#1387), and it is not one a
 * second implementation here could avoid — it IS the second implementation.
 *
 * `/turn-label`, never the package entry: the entry pulls the panel, the store
 * and the transport into the eager graph (+200 kB in the signed-out chunk,
 * ADR-016 D3). That module imports nothing, which is the same reason `contract`
 * is an exception. One door per subject, and this is the third:
 * `advertisement.ts` owns the panel messages, `copilotCapability.ts` the
 * capability names, this one the turn labels.
 */
export {
  messageKind,
  serverSuppliesInvestigationTurn,
  turnLabelFor,
} from '@faultmaven/copilot-ui/turn-label';
export type { MessageKind, TurnLabelled } from '@faultmaven/copilot-ui/turn-label';

/**
 * ONLY WHAT THIS APP CALLS. `displayedTurn` and `investigationTurnFor` are
 * deliberately not re-exported: nothing here uses them, and a name reachable
 * through this module reads as part of this app's contract to the next author.
 * `investigationTurnFor` in particular would be reached for by the evidence
 * surface, where it cannot work — that tab holds no conversation rows
 * (faultmaven#1391). A door is only narrow while it stays shut.
 *
 * `messageKind` comes through it too. The package kept its own copy "rather
 * than a shared package: this is nine lines with no dependencies, and the repos
 * share no runtime code today" — which stopped being true the moment this door
 * opened. Two classifiers that can drift is the same defect as two turn
 * counters, one field over.
 */


/**
 * The turn to print for a CASE, as opposed to a row — the header, the issue
 * summary, the export's front matter.
 *
 * `current_turn` is the message clock, so a case with two asides said "8 turns"
 * over a transcript whose last row said "Turn 6". Contract 3.5.0 added
 * `investigation_turn` to `CaseDetail` for exactly this, and the backend note
 * for #1389 is explicit that shipping only the rows "leaves the same panel
 * showing the bug one line higher".
 *
 * `??` not `||`, for the reason the package gives: 0 is a real answer.
 */
export function caseTurnCount(caseDetail: {
  current_turn: number;
  investigation_turn?: number | null;
}): number {
  return caseDetail.investigation_turn ?? caseDetail.current_turn;
}
