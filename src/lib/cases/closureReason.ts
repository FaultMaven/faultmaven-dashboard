/**
 * Display labels for the engine-derived `closure_reason`, and its published
 * meaning.
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
 * The labels are client copy; what each reason MEANS is not. The contract
 * publishes every value's meaning, `pnpm generate:api-types` vendors it in
 * `src/types/contract-vocabularies.json`, and `closureReasonDisplay` pairs the
 * label with that meaning verbatim (FaultMaven/faultmaven#2411). No Dashboard
 * source restates one.
 *
 * Keyed on `ClosureReason`, so a published reason with no label, or a label
 * for a reason the contract does not publish, fails `tsc`. Like the Copilot's
 * `CLOSURE_DISPLAY_INFO`, an unknown key degrades to a readable fallback rather
 * than disappearing or leaking the raw token: a case can still carry a value
 * retired from the vocabulary, and the backend can add a reason newer than
 * this client's contract pin.
 */

import type { ClosureReason } from '../../types/cases';
import contractVocabularies from '../../types/contract-vocabularies.json';

export interface ClosureReasonDisplay {
  /** Short human label, e.g. for a heading or chip. */
  label: string;
  /** What the outcome means: the contract's published meaning, verbatim. */
  description: string;
}

export const CLOSURE_REASON_DISPLAY: Record<ClosureReason, Pick<ClosureReasonDisplay, 'label'>> = {
  inquiry_only: { label: 'Inquiry only' },
  solution_deferred: { label: 'Fix deferred' },
  closed_rca_infeasible: { label: 'Root cause unreachable' },
  mitigation_sufficient: { label: 'Stabilized by mitigation' },
  closed_restatement_held: { label: 'Cause not stated distinctly' },
  closed_false_alarm: { label: 'False alarm' },
  // Contract 14.8.0 (FaultMaven/faultmaven#2360).
  resolution_declined: { label: 'Fix confirmed' },
  closed_insufficient_evidence: { label: 'Insufficient evidence' },
};

// A Map, so a prototype key such as `constructor` has no meaning.
const CLOSURE_MEANINGS = new Map<string, string>(
  contractVocabularies.ClosureReason.map(({ value, meaning }) => [value, meaning]),
);

// No published meaning covers a reason this build does not know, so the
// fallback's description is client copy.
const FALLBACK: ClosureReasonDisplay = {
  label: 'Closed',
  description: 'The case was closed without a recorded resolution.',
};

/**
 * Resolve a closure reason to something renderable — never undefined: the
 * Dashboard's label and the contract's published meaning.
 *
 * Single resolution path on purpose. In the Copilot the same lookup was
 * hand-rolled per consumer and one of them drifted into dropping the row
 * entirely for an unrecognised value.
 */
export function closureReasonDisplay(
  reason: string | null | undefined,
): ClosureReasonDisplay {
  const meaning = reason == null ? undefined : CLOSURE_MEANINGS.get(reason);
  // Indexed only for a published reason, so never through to `Object`.
  const labels = meaning === undefined ? undefined : CLOSURE_REASON_DISPLAY[reason as ClosureReason];
  return labels && meaning !== undefined ? { label: labels.label, description: meaning } : FALLBACK;
}
