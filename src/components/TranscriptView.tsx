import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { CaseMessage } from '../types/cases';
import { prepareMarkdown } from '../lib/markdownUtils';
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
 * The three ways a transcript row can be presented.
 *
 * `notice` exists because not every row in `case.messages` is a conversational
 * turn: the backend appends runbook-conversion completion notices with
 * `role: "system"` ("Your runbook draft **X** is ready…"), and neither the
 * messages endpoints nor this component filter them out. Rendering was
 * previously a binary — assistant or *you* — so those rows were attributed to
 * the reader, who appeared to have typed FaultMaven's own notification.
 */
type MessageKind = 'user' | 'assistant' | 'notice';

/**
 * Presentation per kind. A `Record` keyed on `MessageKind` so a fourth kind
 * cannot be added without deciding how it looks.
 *
 * The notice treatment is deliberately the quietest of the three — subtle
 * border, tertiary label. It is a notification about the case, not a
 * participant in it, and should not read as one.
 */
const KIND_PRESENTATION: Record<
  MessageKind,
  { label: string; accent: string; labelColor: string }
> = {
  user: { label: 'You', accent: 'border-fm-border', labelColor: 'text-fm-text-primary' },
  assistant: { label: 'FaultMaven', accent: 'border-fm-accent', labelColor: 'text-fm-accent' },
  notice: {
    label: 'System',
    accent: 'border-fm-border-subtle',
    labelColor: 'text-fm-text-tertiary',
  },
};

/**
 * Classify a message for display.
 *
 * The parameter is `string`, not the generated `role` union, on purpose: the
 * union is what the contract *declares*, and the whole point of the default arm
 * is a value the contract did not. Attribution is the failure mode here, so the
 * default must be the one treatment that claims no author — anything the client
 * does not recognise is shown as a notice rather than as something the reader
 * said. Do not narrow this to an equality test on `'system'`; the next role the
 * backend adds would then inherit the bug this replaced.
 */
function messageKind(role: string): MessageKind {
  if (role === 'assistant') return 'assistant';
  if (role === 'user') return 'user';
  return 'notice';
}

/**
 * Renders a case transcript. Purely presentational — it takes messages and does
 * not know where they came from.
 *
 * That is the point: the owner-facing tab loads them from `GET
 * /cases/{id}/messages` and the operator break-glass page from the audited
 * `GET /api/v1/admin/cases/{id}/messages` (ADR-012 D9), and both render through
 * here. The backend deliberately serves the same shape from both, so an
 * operator-opened transcript cannot present differently from the one its owner
 * sees — a divergence would mean an operator reviewing something other than
 * what the customer is looking at.
 */
export function TranscriptView({ messages }: TranscriptViewProps) {
  if (!messages.length) {
    return <div className="text-fm-text-tertiary text-sm py-4">No messages yet.</div>;
  }

  // Turn numbering: each user message opens a turn, and the assistant response
  // belongs to the turn it answers. Notices open nothing and render no number
  // (see below); they are still walked so the counter stays aligned with the
  // rows that do.
  let turnCounter = 0;
  const turnNumbers = messages.map((msg) => {
    if (messageKind(msg.role) === 'user') turnCounter++;
    return turnCounter;
  });

  return (
    <div className="py-2">
      {messages.map((msg, idx) => {
        const kind = messageKind(msg.role);
        const isTurnStart = kind === 'user';
        const isFirst = idx === 0;
        const wrapperClass = isFirst
          ? ''
          : isTurnStart
            ? 'mt-8 pt-6 border-t border-fm-border'
            : 'mt-4';
        const { label, accent, labelColor } = KIND_PRESENTATION[kind];

        return (
          <div key={msg.message_id} className={wrapperClass}>
            <div className={`pl-4 border-l-2 ${accent}`}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-xs font-semibold ${labelColor}`}>{label}</span>
                {/*
                  A notice carries no turn label. `turnCounter` advances only on
                  a user message, so a notice would inherit whichever turn
                  happened to be open when the background job finished — the
                  backend stamps it the same way — and printing that claims the
                  notice is part of an exchange it had no part in. Ordering is
                  already conveyed by its position in the list.
                */}
                {kind !== 'notice' && (
                  <span className="text-[10px] text-fm-text-tertiary font-medium uppercase tracking-wide">
                    Turn {turnNumbers[idx]}
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
