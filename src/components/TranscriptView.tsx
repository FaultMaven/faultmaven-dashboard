import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { CaseMessage } from '../types/cases';
import { prepareMarkdown } from '../lib/markdownUtils';

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
  // belongs to the turn it answers.
  let turnCounter = 0;
  const turnNumbers = messages.map((msg) => {
    if (msg.role === 'user') turnCounter++;
    return turnCounter;
  });

  return (
    <div className="py-2">
      {messages.map((msg, idx) => {
        const isAssistant = msg.role === 'assistant';
        const isTurnStart = msg.role === 'user';
        const isFirst = idx === 0;
        const wrapperClass = isFirst
          ? ''
          : isTurnStart
            ? 'mt-8 pt-6 border-t border-fm-border'
            : 'mt-4';
        const accentClass = isAssistant ? 'border-fm-accent' : 'border-fm-border';
        const labelClass = isAssistant ? 'text-fm-accent' : 'text-fm-text-primary';

        return (
          <div key={msg.message_id} className={wrapperClass}>
            <div className={`pl-4 border-l-2 ${accentClass}`}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-xs font-semibold ${labelClass}`}>
                  {isAssistant ? 'FaultMaven' : 'You'}
                </span>
                <span className="text-[10px] text-fm-text-tertiary font-medium uppercase tracking-wide">
                  Turn {turnNumbers[idx]}
                </span>
              </div>
              <div className={transcriptProseClasses}>
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
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
