import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { CaseMessage } from '../types/cases';
import { prepareMarkdown } from '../lib/markdownUtils';
import {
  MESSAGE_AUTHOR_LABEL,
  messageKind,
  transcriptTurnNumbers,
  transcriptTurnBoundaries,
  type MessageKind,
} from '../lib/cases/messageAttribution';
import { PreWithMermaid } from './MermaidDiagram';

export const transcriptProseClasses = `prose prose-sm prose-invert max-w-none
  prose-headings:text-fm-text-primary prose-headings:font-semibold
  prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
  prose-p:text-fm-text-primary prose-p:leading-relaxed prose-p:my-1
  prose-li:text-fm-text-primary prose-li:my-0
  prose-ul:my-1 prose-ol:my-1
  prose-strong:text-fm-text-primary
  prose-code:text-fm-text-primary prose-code:bg-fm-elevated prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal
  prose-pre:bg-fm-surface-alt prose-pre:border prose-pre:border-fm-border prose-pre:rounded-fm-input prose-pre:my-2
  prose-a:text-fm-accent prose-a:no-underline hover:prose-a:underline
  prose-table:text-sm prose-th:text-fm-text-primary prose-td:text-fm-text-secondary
  prose-hr:border-fm-border`;

interface TranscriptViewProps {
  messages: CaseMessage[];
}

/**
 * How each kind looks *on screen* — this component's half of the split.
 *
 * Who a message is from, what they are called, and whether the row owns a turn
 * are not decided here: they come from `lib/cases/messageAttribution`, shared
 * with the Markdown export so the two transcript renderers cannot disagree
 * about attribution. What is local is the visual treatment, which has no
 * meaning in a Markdown document.
 *
 * A `Record` keyed on `MessageKind` so a fourth kind cannot be added without
 * deciding how it looks. The notice treatment is deliberately the quietest of
 * the three — subtle border, tertiary label. It is a notification about the
 * case, not a participant in it, and should not read as one.
 */
const KIND_PRESENTATION: Record<MessageKind, { accent: string; labelColor: string }> = {
  user: { accent: 'border-fm-border', labelColor: 'text-fm-text-primary' },
  assistant: { accent: 'border-fm-accent', labelColor: 'text-fm-accent' },
  notice: { accent: 'border-fm-border-subtle', labelColor: 'text-fm-text-tertiary' },
};

/**
 * Renders a case transcript as RECORD — read, never continued.
 *
 * Purely presentational: it takes messages and does not know where they came
 * from. Two pages use it, and both are reading rather than investigating.
 *
 * - The OPERATOR break-glass page (ADR-012 D9) reads someone else's case
 *   through the audited `GET /api/v1/admin/cases/{id}/messages`, under a grant,
 *   with no interaction of any kind.
 * - The owner-facing Transcript tab, whenever that user's composer lives
 *   somewhere else (ADR-018 D2) — the extension, the dock, or nowhere at all
 *   for a non-owner.
 *
 * ADR-016 D1 had retired it from the second of those in the name of "one
 * renderer, not two", and ADR-018 deliberately reverses that half: rendering a
 * transcript and running an investigation are different jobs, and conflating
 * them is what made the case record and the conversation about it mutually
 * exclusive tabs. The drift risk that reversal re-opens is bounded — this
 * renders a finished conversation and the panel renders a live one, so the two
 * can differ in presentation but not in capability, and capability is what bit
 * last time. Whichever is showing, there is only ever one.
 *
 * So it is NOT interchangeable with the shared panel in either direction. The
 * panel is an interactive shell bound to the signed-in user's own cases and
 * could not answer for the break-glass page even if it were asked to; and it
 * carries a composer, which is the thing a record view must not have.
 */
export function TranscriptView({ messages }: TranscriptViewProps) {
  if (!messages.length) {
    return <div className="text-fm-text-tertiary text-sm py-4">No messages yet.</div>;
  }

  // `null` for a notice: it owns no turn and prints none. See
  // `transcriptTurnNumbers` for why, and for why that call is not made here.
  const turnNumbers = transcriptTurnNumbers(messages);
  const turnStarts = transcriptTurnBoundaries(messages);

  return (
    <div className="py-2">
      {messages.map((msg, idx) => {
        const kind = messageKind(msg.role);
        // A NEW TURN, from the derivation that knows what a turn is — not from
        // comparing printed labels, which made a notice inside a turn look like
        // a boundary and split a question from its own answer.
        const isTurnStart = turnStarts[idx];
        const isFirst = idx === 0;
        const wrapperClass = isFirst
          ? ''
          : isTurnStart
            ? 'mt-8 pt-6 border-t border-fm-border'
            : 'mt-4';
        const { accent, labelColor } = KIND_PRESENTATION[kind];
        const turn = turnNumbers[idx];

        return (
          <div key={msg.message_id} className={wrapperClass}>
            <div className={`pl-4 border-l-2 ${accent}`}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-xs font-semibold ${labelColor}`}>
                  {MESSAGE_AUTHOR_LABEL[kind]}
                </span>
                {turn !== null && (
                  <span className="text-[10px] text-fm-text-tertiary font-medium uppercase tracking-wide">
                    Turn {turn}
                  </span>
                )}
              </div>
              <div className={transcriptProseClasses}>
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                    // The closure-turn reply embeds the resolution summary
                    // (Causal Map included) inline, so the transcript needs
                    // the same mermaid routing as the Report tab.
                    pre: PreWithMermaid,
                  }}
                >
                  {prepareMarkdown(msg.content)}
                </Markdown>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
