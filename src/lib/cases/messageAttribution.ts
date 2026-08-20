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

/** The three ways a transcript row can be presented. */
export type MessageKind = 'user' | 'assistant' | 'notice';

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
export function messageKind(role: string): MessageKind {
  if (role === 'assistant') return 'assistant';
  if (role === 'user') return 'user';
  return 'notice';
}

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
 */
export function transcriptTurnNumbers(messages: readonly CaseMessage[]): (number | null)[] {
  let turn = 0;
  return messages.map((msg) => {
    const kind = messageKind(msg.role);
    if (kind === 'user') turn++;
    return kind === 'notice' ? null : turn;
  });
}
