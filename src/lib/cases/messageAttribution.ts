/**
 * Who said what, and in which turn — the single derivation behind every
 * transcript surface.
 *
 * The Dashboard renders a case transcript twice: on screen (`TranscriptView`,
 * itself shared by the owner tab and the operator break-glass page) and into
 * the Markdown export (`exportMarkdown`). Both used to decide attribution for
 * themselves, with the same two-way branch:
 *
 *     msg.role === 'assistant' ? 'FaultMaven' : 'You'
 *
 * which labelled *anything* that was neither role as something the reader had
 * said. That is not a rendering detail — the backend appends runbook-conversion
 * completion notices to `case.messages` with `role: "system"`, so a user was
 * shown as the author of "Your runbook draft is ready", and the export wrote
 * the same claim into an archival, shareable document.
 *
 * Attribution therefore lives here rather than in either renderer, so the two
 * cannot be fixed — or broken — independently. Each renderer decides only how
 * its own medium *presents* a kind (Tailwind classes, Markdown headings); what
 * the kind IS, what it is called, and whether it owns a turn are decided once.
 *
 * Same shape and same reason as `closureReason.ts`: a pure, view-agnostic
 * mapping from a backend value to display, where an unrecognised value must
 * degrade safely instead of being presented as something it is not.
 */

import type { CaseMessage } from '../../types/cases';
import {
  messageKind,
  serverSuppliesInvestigationTurn,
  turnLabelFor,
  type MessageKind,
} from './turnLabel';

// RE-EXPORTED, not re-implemented. The package ships the same nine lines and
// says it kept them as a copy only because "the repos share no runtime code
// today"; the turn-label door ended that. Two classifiers that can drift would
// let the dock and this tab attribute one row differently.
export { messageKind };
export type { MessageKind };

/** The three ways a transcript row can be presented. */

/**
 * Classify a message for display.
 *
 * The parameter is `string`, not the generated `role` union, on purpose: the
 * union is what the contract *declares*, and the whole point of the default arm
 * is a value the contract did not. Attribution is the failure mode here, so the
 * default must be the one kind that claims no human author — anything a client
 * does not recognise is a notice rather than something the reader said. Do not
 * narrow this to an equality test on `'system'`; the next role the backend adds
 * would then inherit the bug this replaced.
 */


/**
 * The author name shown for each kind, in every medium.
 *
 * A `Record` keyed on `MessageKind` so a fourth kind cannot be added without
 * naming it.
 */
export const MESSAGE_AUTHOR_LABEL: Record<MessageKind, string> = {
  user: 'You',
  assistant: 'FaultMaven',
  notice: 'System',
};

/** Convenience: the author name for a raw backend role. */
export function messageAuthorLabel(role: string): string {
  return MESSAGE_AUTHOR_LABEL[messageKind(role)];
}

/**
 * Turn number per message, positionally aligned with `messages`.
 *
 * THE ROW'S OWN `investigation_turn` WHEN THE SERVER SENDS ONE (#127, contract
 * 3.5.0). That is the per-row ORDINAL — the message clock at that row minus the
 * out-of-band turns at or before it — so an aside (small talk, trivia, a
 * question about FaultMaven itself) shares the number of the exchange before
 * it instead of pushing every later turn along by one. `State: investigating
 * Turn 8` after a haiku was the symptom (faultmaven#1329).
 *
 * It has to come from the server. Counting locally would need the whole history
 * from turn 1 AND a second implementation of what counts as out-of-band, and
 * the live panel next to this one cannot count at all — its store is trimmed —
 * so the two Dashboard surfaces would have printed different numbers for one
 * exchange (faultmaven#1387).
 *
 * THE RULES ARE THE PACKAGE'S, not this file's. `turnLabelFor` decides both
 * halves: what the turn IS (`investigation_turn ?? turn_number` — `??` because
 * 0 is a real answer) and whether to PRINT it (no, at 0: "Turn 0" names a turn
 * the investigation has not reached).
 *
 * An earlier version of this counted POSITIONS as its fallback and suppressed
 * nothing at 0. Both were wrong in the same way: the panel beside this
 * transcript falls back to `turn_number` and prints no label at 0, so the dock
 * and the tab numbered one conversation two ways and the number moved when you
 * collapsed the dock — the exact defect this change exists to remove. A second
 * implementation of "which number" cannot avoid that; it is that.
 *
 * Each user message opens a turn and the assistant reply shares it. A notice
 * gets `null` — it owns no turn and must not print one. The counter advances
 * only on a user message, so a notice would otherwise inherit whichever turn
 * happened to be open when the background job that produced it finished (the
 * backend stamps `turn_number: case.current_turn` the same way), and printing
 * that number asserts the notice was part of an exchange it had no part in.
 * Its position in the transcript already carries the ordering.
 *
 * The suppression lives here, not in the renderers, for the same reason the
 * labels do: a turn number is part of the attribution claim, so the two
 * surfaces must not be able to disagree about it either. Notices are still
 * walked, so the turns on either side of one are unaffected.
 *
 * ⚠️ THIS IS FOR DISPLAY ONLY. `turn_number` stays the message clock and is what
 * evidence `uploaded_at_turn` and the conversation anchors are keyed on — so
 * anything that ADDRESSES a turn must keep using it. Re-basing an anchor onto
 * the ordinal would break "jump to turn" silently.
 */
export function transcriptTurnNumbers(messages: readonly CaseMessage[]): (number | null)[] {
  // ALL OR NOTHING, decided once for the conversation. A case that ran across
  // the 3.5.0 deploy holds older rows with no ordinal beside newer rows that
  // have one; labelling each from whatever it happens to carry mixes the two
  // counters inside one transcript, and the number goes BACKWARD at the seam.
  // When the server supplies ordinals, a row without one gets no label rather
  // than a number from the other counter.
  const ordinals = serverSuppliesInvestigationTurn(messages);
  return messages.map((msg) => {
    if (messageKind(msg.role) === 'notice') return null;
    // Still suppressed at 0 — the ordinals branch must not route around the
    // display rule. `investigation_turn` of 0 means the investigation has not
    // reached a turn yet; a row without one, on a server that supplies them,
    // gets no label rather than a number from the other counter.
    if (ordinals) return msg.investigation_turn ? msg.investigation_turn : null;
    return turnLabelFor(msg) ?? null;
  });
}

/**
 * Where a new turn STARTS, positionally aligned with `messages`.
 *
 * Separate from the labels because they answer different questions, and
 * conflating them put a heavy turn divider between a question and its own
 * answer. `transcriptTurnNumbers` returns a RENDER decision — `null` means
 * print nothing — so comparing consecutive labels made a notice sitting inside
 * a turn look like a turn boundary on the row after it. Measured: three rows
 * `[user, notice, assistant]` produced one divider where there is one turn.
 *
 * A notice never starts a turn, and it never ends one either: the comparison
 * skips it and looks back to the last row that owns a turn.
 */
export function transcriptTurnBoundaries(messages: readonly CaseMessage[]): boolean[] {
  const labels = transcriptTurnNumbers(messages);
  let previous: number | null | undefined;
  return messages.map((msg, idx) => {
    if (messageKind(msg.role) === 'notice') return false;
    const starts = previous !== undefined && labels[idx] !== previous;
    previous = labels[idx];
    return starts;
  });
}
