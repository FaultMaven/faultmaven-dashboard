import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The two rules a saved-then-rejected runbook used to be created by.
 *
 * The backend SAVES a manually created runbook and reports validation
 * separately, so an invalid one is persisted and then rejected — recoverable
 * only by hand-editing the generated YAML frontmatter and markdown, a long way
 * from the form the author filled in. Both of the rules that produced that are
 * knowable here, before anything is sent:
 *
 *  - `symptom_class` is a CLOSED 16-value vocabulary, and used to be a free
 *    text box. `this_a_test_for_runbook_creation` was a perfectly acceptable
 *    thing to type.
 *  - Causes must contain at least one `### Cause` subsection — a markdown
 *    convention no form control enforces, shown only in a placeholder that
 *    disappears the moment the author types a word of prose.
 */

vi.mock('../../hooks/useAvailableScopes', () => ({
  useAvailableScopes: () => ({ scopes: ['personal', 'team'], loading: false }),
}));

import { CreateRunbookForm } from '../../components/CreateRunbookForm';

const onSubmit = vi.fn().mockResolvedValue(undefined);

function renderForm() {
  return render(<CreateRunbookForm onSubmit={onSubmit} onCancel={vi.fn()} loading={false} error={null} />);
}

/** Fill everything the browser itself enforces, so only our rules can block. */
function fillRequiredText() {
  fireEvent.change(screen.getByPlaceholderText(/PostgreSQL Connection Pool Exhaustion/), {
    target: { value: 'A sufficiently long runbook title' },
  });
  fireEvent.change(screen.getByPlaceholderText(/postgresql, nginx, kubernetes/), {
    target: { value: 'postgresql' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('symptom classes', () => {
  it('are CHOSEN from the vocabulary, never typed', () => {
    renderForm();

    // The old free-text box is gone; every value is a control.
    expect(screen.queryByPlaceholderText(/connection_refused, latency, oom/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'connection_refused' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'oom' })).toBeInTheDocument();
  });

  it('blocks submission until at least one is picked', async () => {
    renderForm();
    fillRequiredText();

    fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!);
    await waitFor(() => expect(screen.getByText(/Pick at least one symptom class/)).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('toggles on and off, and the warning clears', async () => {
    renderForm();
    fillRequiredText();

    fireEvent.click(screen.getByRole('button', { name: 'latency' }));
    expect(screen.getByRole('button', { name: 'latency' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(screen.queryByText(/Pick at least one symptom class/)).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'latency' }));
    await waitFor(() => expect(screen.getByText(/Pick at least one symptom class/)).toBeInTheDocument());
  });

  it('points a long-tail symptom at Tags, which is the escape valve', () => {
    renderForm();
    expect(screen.getByText(/not on this list belongs in Tags/i)).toBeInTheDocument();
  });
});

describe('the Causes structure', () => {
  it('blocks submission when no ### Cause subsection is present', async () => {
    renderForm();
    fillRequiredText();
    fireEvent.click(screen.getByRole('button', { name: 'latency' }));

    const causes = screen.getAllByRole('textbox').find((el) => el.tagName === 'TEXTAREA' &&
      (el as HTMLTextAreaElement).placeholder.includes('### Cause A'))!;
    fireEvent.change(causes, { target: { value: 'Just some prose about what went wrong.' } });

    fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!);
    await waitFor(() => expect(screen.getByText(/must contain at least one "### Cause"/)).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepts it once the subsection is there', async () => {
    renderForm();
    fillRequiredText();
    fireEvent.click(screen.getByRole('button', { name: 'latency' }));

    const causes = screen.getAllByRole('textbox').find((el) => el.tagName === 'TEXTAREA' &&
      (el as HTMLTextAreaElement).placeholder.includes('### Cause A'))!;
    fireEvent.change(causes, {
      target: { value: '### Cause A: Pool exhaustion\n**Statement:** The pool saturated.' },
    });

    await waitFor(() =>
      expect(screen.queryByText(/must contain at least one "### Cause"/)).not.toBeInTheDocument(),
    );
  });

  it('says so under the field, not only in the placeholder', () => {
    // The placeholder carried the whole template and vanished on first keypress,
    // which is precisely when the author stops being told about the rule.
    renderForm();
    expect(screen.getByText(/Needs at least one/)).toBeInTheDocument();
  });
});

describe('the required selects', () => {
  it.each(['Domain', 'Severity', 'KB Scope'])('start UNCHOSEN (%s)', (label) => {
    // Pre-filling them wrote metadata the author never chose into every
    // runbook, and that metadata ranks retrieval.
    renderForm();
    const select = screen.getByLabelText(new RegExp(`^${label}`), { selector: 'select' });

    expect((select as HTMLSelectElement).value).toBe('');
    expect(select).toBeRequired();
  });

  it('leaves Difficulty genuinely optional, because the backend defaults it', () => {
    renderForm();
    const select = screen.getByLabelText(/^Difficulty/, { selector: 'select' }) as HTMLSelectElement;

    expect(select.value).toBe('');
    expect(select).not.toBeRequired();
    expect(screen.getByRole('option', { name: 'Not specified' })).toBeInTheDocument();
  });
});
