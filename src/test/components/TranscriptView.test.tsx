import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptView } from '../../components/TranscriptView';
import type { CaseMessage } from '../../types/cases';

function makeMessage(overrides: Partial<CaseMessage> & { message_id: string }): CaseMessage {
  return {
    role: 'user',
    content: 'placeholder',
    created_at: '2024-01-01T00:00:00Z',
    turn_number: 1,
    ...overrides,
  };
}

/**
 * A message whose role is outside the generated contract union. The cast is the
 * point of the test: the union describes what the backend *declares*, and this
 * asserts what the component does with a value it did not — a role added
 * server-side and served to a client that predates it.
 */
function makeUnknownRoleMessage(message_id: string, content: string): CaseMessage {
  return {
    message_id,
    role: 'tool',
    content,
    created_at: '2024-01-01T00:00:00Z',
    turn_number: 1,
  } as unknown as CaseMessage;
}

/** The label rendered for a message, read from the row's header. */
function labelFor(content: string): string | null {
  const row = screen.getByText(content).closest('div.pl-4');
  return row?.querySelector('span')?.textContent ?? null;
}

describe('TranscriptView — message attribution', () => {
  it('labels the two conversational roles', () => {
    render(
      <TranscriptView
        messages={[
          makeMessage({ message_id: 'm1', role: 'user', content: 'The database is down' }),
          makeMessage({ message_id: 'm2', role: 'assistant', content: 'When did it start?' }),
        ]}
      />
    );

    expect(labelFor('The database is down')).toBe('You');
    expect(labelFor('When did it start?')).toBe('FaultMaven');
  });

  it('does not attribute a system message to the user', () => {
    // Verbatim shape of the runbook-conversion completion notice the backend
    // appends to `case.messages` (milestone_engine `_run_runbook_conversion`).
    // Rendered as "You", it read as the user announcing their own runbook.
    const notice = 'Your runbook draft is ready. View it in the Dashboard.';
    render(
      <TranscriptView
        messages={[
          makeMessage({ message_id: 'm1', role: 'user', content: 'Generate a runbook' }),
          makeMessage({
            message_id: 'm2',
            role: 'system',
            content: notice,
            metadata: { source: 'runbook_conversion_complete' },
          }),
        ]}
      />
    );

    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(labelFor(notice)).not.toBe('You');
    expect(labelFor(notice)).not.toBe('FaultMaven');
    expect(labelFor(notice)).toBe('System');
  });

  it('does not attribute an unrecognised role to the user', () => {
    render(
      <TranscriptView
        messages={[
          makeMessage({ message_id: 'm1', role: 'user', content: 'Generate a runbook' }),
          makeUnknownRoleMessage('m2', 'Something a future backend sent'),
        ]}
      />
    );

    // The safety property, not the instance: whatever an unknown role renders
    // as, it must never claim the reader said it.
    expect(labelFor('Something a future backend sent')).not.toBe('You');
    expect(labelFor('Something a future backend sent')).toBe('System');
  });

  it('gives a notice no turn label, and does not disturb the turns around it', () => {
    render(
      <TranscriptView
        messages={[
          makeMessage({ message_id: 'm1', role: 'user', content: 'First question' }),
          makeMessage({ message_id: 'm2', role: 'assistant', content: 'First answer' }),
          makeMessage({ message_id: 'm3', role: 'system', content: 'Draft ready' }),
          makeMessage({ message_id: 'm4', role: 'user', content: 'Second question' }),
        ]}
      />
    );

    const noticeRow = screen.getByText('Draft ready').closest('div.pl-4');
    expect(noticeRow?.textContent).not.toMatch(/Turn/);

    // The notice sits inside turn 1 chronologically but claims no turn of its
    // own, and the next user message still opens turn 2.
    expect(screen.getByText('First question').closest('div.pl-4')?.textContent).toContain('Turn 1');
    expect(screen.getByText('Second question').closest('div.pl-4')?.textContent).toContain(
      'Turn 2'
    );
  });

  it('renders a notice more quietly than a conversational turn', () => {
    render(
      <TranscriptView
        messages={[
          makeMessage({ message_id: 'm1', role: 'user', content: 'A question' }),
          makeMessage({ message_id: 'm2', role: 'assistant', content: 'An answer' }),
          makeMessage({ message_id: 'm3', role: 'system', content: 'Draft ready' }),
        ]}
      />
    );

    const accentOf = (content: string) =>
      screen.getByText(content).closest('div.pl-4')?.className ?? '';

    expect(accentOf('Draft ready')).toContain('border-fm-border-subtle');
    expect(accentOf('A question')).not.toContain('border-fm-border-subtle');
    expect(accentOf('An answer')).toContain('border-fm-accent');
  });
});
