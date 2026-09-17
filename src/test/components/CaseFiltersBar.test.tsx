import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CaseFiltersBar } from '../../components/CaseFiltersBar';
import type { CaseFilters, Team } from '../../types/cases';

/**
 * `onChange` is a React-style setter: the bar hands it an UPDATER, not a value.
 *
 * That is what makes "preserves the other filters" structural rather than
 * something each handler has to remember — it composes against whatever the
 * filters are when it runs, including a debounced search firing 300ms after the
 * keystroke that scheduled it. So the assertions below apply the updater to a
 * known previous state and check the result, which is the guarantee that
 * actually matters.
 */
function applyLast(onChange: ReturnType<typeof vi.fn>, prev: CaseFilters): CaseFilters {
  const update = onChange.mock.calls.at(-1)?.[0];
  return typeof update === 'function' ? update(prev) : update;
}

const TEAMS: Team[] = [
  { team_id: 't1', name: 'SRE', enterprise_id: 'ent-1' },
  { team_id: 't2', name: 'Platform', enterprise_id: 'ent-1' },
];

describe('CaseFiltersBar', () => {
  it('preserves other active filters when typing in search', async () => {
    const onChange = vi.fn();

    // Mount with no filters, then update filters (as the parent does after a
    // chip click). The debounced search callback is memoized on [onChange]; the
    // stale-closure bug captured the first-render (empty) filters and wiped the
    // other active filters on the next keystroke.
    const { rerender } = render(<CaseFiltersBar filters={{}} onChange={onChange} />);

    const activeFilters: CaseFilters = { state: 'resolved', source: 'copilot' };
    rerender(<CaseFiltersBar filters={activeFilters} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Search cases'), {
      target: { value: 'payment' },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(applyLast(onChange, activeFilters)).toEqual({
      state: 'resolved',
      source: 'copilot',
      search: 'payment',
    });
  });

  it('a search that fires LATE still composes against the filters of the moment', async () => {
    // The cancellation bug, from the other side. Type, then change another
    // filter inside the 300ms window: the queued search used to be thrown away
    // (a new debounced fn was built and the old one cancelled), leaving the
    // uncontrolled box showing a term that was never applied. Now one debounced
    // function lives for the life of the bar and composes at FIRE time.
    const onChange = vi.fn();
    render(<CaseFiltersBar filters={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Search cases'), {
      target: { value: 'payment' },
    });
    // ...and a date is picked before the debounce fires.
    fireEvent.change(screen.getByLabelText('Created from'), {
      target: { value: '2026-09-10' },
    });

    // BOTH land — the date and the search each fire their own debounce, and
    // each composes against the filters of the moment rather than a snapshot
    // taken when it was scheduled. Before, the date's `onChange` rebuilt the
    // search's debounced function and the cleanup cancelled the queued term.
    await waitFor(() => expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(2));

    const emitted = onChange.mock.calls.map(([update]) =>
      typeof update === 'function' ? update({}) : update,
    );
    expect(emitted.some((f) => f.search === 'payment')).toBe(true);
    expect(emitted.some((f) => f.date_from === '2026-09-10')).toBe(true);
  });

  it('clears the search key when the query is emptied', async () => {
    const onChange = vi.fn();
    render(<CaseFiltersBar filters={{ state: 'investigating' }} onChange={onChange} />);

    const input = screen.getByLabelText('Search cases');
    fireEvent.change(input, { target: { value: 'db' } });
    fireEvent.change(input, { target: { value: '' } });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(applyLast(onChange, { state: 'investigating' })).toEqual({
      state: 'investigating',
      search: undefined,
    });
  });

  it('applies a state chip without dropping other active filters', () => {
    const onChange = vi.fn();
    render(<CaseFiltersBar filters={{ date_from: '2026-09-10' }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));

    expect(applyLast(onChange, { date_from: '2026-09-10' })).toEqual({
      date_from: '2026-09-10',
      state: 'resolved',
    });
  });

  it('DISABLES the state chips during a search, because the endpoint ignores them', () => {
    // Pins CURRENT client behaviour, not a server limitation: contract 3.9.0
    // made `POST /cases/search` apply `state`, but `searchCases` still does not
    // send it, so the chip would not narrow anything. Adopting 3.9.0 here means
    // re-enabling these and sending the field (#166) — at which point this test
    // is the one that should change.
    const onChange = vi.fn();
    render(<CaseFiltersBar filters={{ search: 'db' }} onChange={onChange} />);

    const chip = screen.getByRole('button', { name: 'Resolved' });
    expect(chip).toBeDisabled();
    fireEvent.click(chip);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('CaseFiltersBar team filter (ADR-013 §D4)', () => {
  it('renders no team filter when no teams are supplied', () => {
    render(<CaseFiltersBar filters={{}} onChange={() => {}} />);
    expect(screen.queryByLabelText('Filter by team')).not.toBeInTheDocument();
  });

  it('renders no team filter when the team list is empty', () => {
    render(<CaseFiltersBar filters={{}} onChange={() => {}} teams={[]} />);
    expect(screen.queryByLabelText('Filter by team')).not.toBeInTheDocument();
  });

  it('renders a team option per team plus an "All teams" default', () => {
    render(<CaseFiltersBar filters={{}} onChange={() => {}} teams={TEAMS} />);
    const select = screen.getByLabelText('Filter by team');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All teams' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'SRE' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Platform' })).toBeInTheDocument();
  });

  it('emits the selected team_id, and clears it on "All teams"', () => {
    const onChange = vi.fn();
    render(<CaseFiltersBar filters={{}} onChange={onChange} teams={TEAMS} />);

    fireEvent.change(screen.getByLabelText('Filter by team'), { target: { value: 't2' } });
    expect(applyLast(onChange, {})).toEqual(expect.objectContaining({ team_id: 't2' }));

    fireEvent.change(screen.getByLabelText('Filter by team'), { target: { value: '' } });
    expect(applyLast(onChange, { team_id: 't2' })).toEqual(
      expect.objectContaining({ team_id: undefined }),
    );
  });

  it('hides the team filter in stateOnly mode (admin view)', () => {
    render(<CaseFiltersBar filters={{}} onChange={() => {}} teams={TEAMS} stateOnly />);
    expect(screen.queryByLabelText('Filter by team')).not.toBeInTheDocument();
  });
});

/**
 * THE DATE RANGE, restored with contract 3.8.0.
 *
 * The version deleted in PR #52 sent `date_from`/`date_to` at a route that
 * declared neither, so it filtered nothing and said nothing — the reason #51
 * exists. These tests hold the two properties that keep it honest: the control
 * reflects what is actually applied, and it is not offered where it would not be.
 */
describe('CaseFiltersBar — creation-date range', () => {
  it('emits the picked day as a calendar day, untouched', async () => {
    // The filter state stays in the picker's own vocabulary; resolving a day to
    // instants happens once, at the API boundary, where the viewer's timezone is
    // applied. A component that converted here would do it twice.
    const onChange = vi.fn();
    render(<CaseFiltersBar filters={{ state: 'resolved' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Created from'), {
      target: { value: '2026-09-10' },
    });

    // Debounced, like the search box: a date input reports every intermediate
    // value as the year is typed, and each one was firing its own GET /cases.
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(applyLast(onChange, { state: 'resolved' })).toEqual({
      state: 'resolved',
      date_from: '2026-09-10',
    });
  });

  it('clears a bound when its input is emptied, keeping the other', async () => {
    const onChange = vi.fn();
    render(
      <CaseFiltersBar
        filters={{ date_from: '2026-09-10', date_to: '2026-09-12' }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Created from'), { target: { value: '' } });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(applyLast(onChange, { date_from: '2026-09-10', date_to: '2026-09-12' })).toEqual({
      date_from: undefined,
      date_to: '2026-09-12',
    });
  });

  it('will not let the browser offer an inverted range', () => {
    // Cheaper than accepting one and explaining the empty list afterwards.
    render(
      <CaseFiltersBar
        filters={{ date_from: '2026-09-10', date_to: '2026-09-12' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Created from')).toHaveAttribute('max', '2026-09-12');
    expect(screen.getByLabelText('Created to')).toHaveAttribute('min', '2026-09-10');
  });

  it('shows what is applied, so a bound cannot linger after the parent clears it', () => {
    // Controlled, not `defaultValue`: an uncontrolled input keeps rendering a
    // value the parent has since dropped, which is a filter bar disagreeing with
    // the list beside it.
    const { rerender } = render(
      <CaseFiltersBar filters={{ date_from: '2026-09-10' }} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Created from')).toHaveValue('2026-09-10');

    rerender(<CaseFiltersBar filters={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Created from')).toHaveValue('');
  });

  it('DISABLES the dates whenever a search term is set', () => {
    // `POST /cases/search` takes a query, a limit, a team and a state — no date
    // bounds. An enabled input there would be #51 again in a narrower window:
    // accepted, dropped, and indistinguishable from a range that matched nothing.
    //
    // Keyed on `filters.search`, NOT on a `searchMode` the list hook sets after
    // a request settles: that flag describes the last RESPONSE, and it is wrong
    // in both directions the moment one fails — a rejected search leaves the
    // dates enabled while a search is still what happens next.
    render(<CaseFiltersBar filters={{ search: 'payment' }} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Created from')).toBeDisabled();
    expect(screen.getByLabelText('Created to')).toBeDisabled();
  });

  it('says why ON SCREEN, not only to a screen reader', () => {
    // Two earlier attempts both failed a sighted mouse user: a `title` on the
    // wrapping div (assistive tech does not announce one on a non-interactive
    // element) and then `sr-only` text plus a `title` on the inputs — but a
    // `title` does not render on a DISABLED control in Chrome or Safari, which
    // suppress pointer events on them, and `sr-only` is invisible by
    // definition. So it is real, rendered text now, referenced by every control
    // it applies to.
    render(<CaseFiltersBar filters={{ search: 'payment' }} onChange={vi.fn()} />);

    const reason = screen.getByText(/does not apply to a text search/i);
    expect(reason).toBeVisible();
    expect(reason).not.toHaveClass('sr-only');

    for (const label of ['Created from', 'Created to']) {
      expect(screen.getByLabelText(label).getAttribute('aria-describedby')).toBe(reason.id);
    }
    // The state chips are gated by the same rule and point at the same sentence.
    const chip = screen.getByRole('button', { name: 'Resolved' });
    expect(chip).toBeDisabled();
    expect(chip.getAttribute('aria-describedby')).toBe(reason.id);
  });

  it('carries no stale reason once the search is cleared', () => {
    render(<CaseFiltersBar filters={{}} onChange={vi.fn()} />);
    const from = screen.getByLabelText('Created from');
    expect(from).toBeEnabled();
    expect(from.getAttribute('aria-describedby')).toBeNull();
  });

  it('KEEPS the range while disabled, so clearing the search restores it', () => {
    // Clearing the bounds on the first keystroke would silently discard the
    // user's range; they are meant to come back when the search box empties.
    const filters: CaseFilters = { date_from: '2026-09-10', search: 'payment' };
    const { rerender } = render(
      <CaseFiltersBar filters={filters} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Created from')).toHaveValue('2026-09-10');

    rerender(<CaseFiltersBar filters={{ date_from: '2026-09-10' }} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Created from')).toBeEnabled();
    expect(screen.getByLabelText('Created from')).toHaveValue('2026-09-10');
  });

  it('offers no date inputs in stateOnly mode (the admin view)', () => {
    // `GET /admin/cases` takes state and source only, and this bar's whole rule
    // is that it shows no control which would silently do nothing.
    render(<CaseFiltersBar filters={{}} onChange={vi.fn()} stateOnly />);

    expect(screen.queryByLabelText('Created from')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Created to')).not.toBeInTheDocument();
  });
});

describe('CaseFiltersBar — clearing the creation-date range', () => {
  it('offers no clear control until there is something to clear', () => {
    render(<CaseFiltersBar filters={{}} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });

  it('clears both bounds at once, leaving everything else alone', () => {
    const onChange = vi.fn();
    render(
      <CaseFiltersBar
        filters={{ date_from: '2026-09-10', date_to: '2026-09-12', state: 'resolved' }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(
      applyLast(onChange, { date_from: '2026-09-10', date_to: '2026-09-12', state: 'resolved' }),
    ).toEqual({ date_from: undefined, date_to: undefined, state: 'resolved' });
  });

  it('STAYS USABLE during a search, when the inputs themselves are not', () => {
    // The trap it exists for: a range set before a search cannot be removed
    // otherwise — both inputs are disabled, and the range is deliberately kept
    // so it returns when the box empties. The only route back was to clear the
    // search, watch the stale range silently re-apply, and empty two inputs by
    // hand — while the empty state said "Clear the filters to see everything"
    // and the page offered nothing that did.
    const onChange = vi.fn();
    render(
      <CaseFiltersBar
        filters={{ date_from: '2026-09-10', search: 'payment' }}
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText('Created from')).toBeDisabled();
    const clear = screen.getByRole('button', { name: /clear/i });
    expect(clear).toBeEnabled();

    fireEvent.click(clear);
    expect(applyLast(onChange, { date_from: '2026-09-10', search: 'payment' })).toEqual({
      date_from: undefined,
      date_to: undefined,
      search: 'payment',
    });
  });
});
