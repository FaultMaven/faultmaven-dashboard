/**
 * Display labels for the engine-derived `closure_reason`.
 *
 * `closure_reason` is a CLASSIFICATION, not prose: the backend derives it from
 * case state at the terminal transition and the LLM never authors it (the
 * contract publishes the vocabulary as the `ClosureReason` enum).
 * The Dashboard was rendering the raw value under a "Resolution Notes" heading,
 * so a user saw `closed_insufficient_evidence` presented as if it were a
 * sentence someone wrote.
 *
 * It is also CLOSED-only — RESOLVED cases carry `null` — so the surrounding
 * copy must not promise resolution notes.
 *
 * Keyed on `ClosureReason`, so a published reason with no label, or a label
 * for a reason the contract does not publish, fails `tsc`. Like the Copilot's
 * `CLOSURE_DISPLAY_INFO`, an unknown key degrades to a readable fallback rather
 * than disappearing or leaking the raw token: a case can still carry a value
 * retired from the vocabulary, and the backend can add a reason newer than
 * this client's contract pin.
 */

import type { ClosureReason } from '../../types/cases';

export interface ClosureReasonDisplay {
  /** Short human label, e.g. for a heading or chip. */
  label: string;
  /** One sentence explaining what the outcome means. */
  description: string;
}

export type ClosureReasonTable = Record<ClosureReason, ClosureReasonDisplay>;

export const CLOSURE_REASON_DISPLAY: ClosureReasonTable = {
  inquiry_only: {
    label: 'Inquiry only',
    description: 'Closed from inquiry — no investigation was started.',
  },
  solution_deferred: {
    label: 'Fix deferred',
    description:
      'The cause was identified and a fix documented; implementation happens out-of-band.',
  },
  closed_rca_infeasible: {
    label: 'Root cause unreachable',
    description:
      'The root cause cannot be reached for this problem; the mitigation is the accepted strategy.',
  },
  mitigation_sufficient: {
    label: 'Stabilized by mitigation',
    description:
      'A verified mitigation relieved the symptom; root-cause analysis was deferred.',
  },
  closed_restatement_held: {
    label: 'Cause not stated distinctly',
    description:
      'The evidence supported a cause, but it was never stated distinctly from the problem — what was missing was a mechanism, not more data.',
  },
  closed_false_alarm: {
    label: 'False alarm',
    description:
      'The evidence showed the reported problem was not present; there was nothing to fix.',
  },
  // Contract 14.8.0 (FaultMaven/faultmaven#2360): the user declined to mark a
  // confirmed fix resolved, then closed. No actor in the description: a team
  // reader did not decline, and the driver can change after close.
  resolution_declined: {
    label: 'Fix confirmed',
    description:
      'The fix was confirmed to work; the case was closed rather than marked resolved.',
  },
  closed_insufficient_evidence: {
    label: 'Insufficient evidence',
    description:
      'Closed without establishing the problem or its cause; the partial findings are preserved.',
  },
};

const FALLBACK: ClosureReasonDisplay = {
  label: 'Closed',
  description: 'The case was closed without a recorded resolution.',
};

/**
 * Resolve a closure reason to something renderable — never undefined.
 *
 * Single resolution path on purpose. In the Copilot the same lookup was
 * hand-rolled per consumer and one of them drifted into dropping the row
 * entirely for an unrecognised value.
 *
 * Only an own key resolves, so a prototype key such as `constructor` falls back
 * too rather than resolving to a function. Not `Object.hasOwn`: the app's
 * `lib` is ES2020.
 */
export function closureReasonDisplay(
  reason: string | null | undefined,
): ClosureReasonDisplay {
  return reason != null &&
    Object.prototype.hasOwnProperty.call(CLOSURE_REASON_DISPLAY, reason)
    ? CLOSURE_REASON_DISPLAY[reason as ClosureReason]
    : FALLBACK;
}
