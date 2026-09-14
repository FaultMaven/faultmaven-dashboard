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

    await waitFor(() => {
      const applied = applyLast(onChange, { date_from: '2026-09-10' });
      expect(applied.search).toBe('payment');
    });
    // The date the user picked in the meantime survives it.
    expect(applyLast(onChange, { date_from: '2026-09-10' }).date_from).toBe('2026-09-10');
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

  it('applies a state chip without dropping an existing search term', () => {
    const onChange = vi.fn();
    render(<CaseFiltersBar filters={{ search: 'db' }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));

    expect(applyLast(onChange, { search: 'db' })).toEqual({ search: 'db', state: 'resolved' });
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
  it('emits the picked day as a calendar day, untouched', () => {
    // The filter state stays in the picker's own vocabulary; resolving a day to
    // instants happens once, at the API boundary, where the viewer's timezone is
    // applied. A component that converted here would do it twice.
    const onChange = vi.fn();
    render(<CaseFiltersBar filters={{ state: 'resolved' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Created from'), {
      target: { value: '2026-09-10' },
    });

    expect(applyLast(onChange, { state: 'resolved' })).toEqual({
      state: 'resolved',
      date_from: '2026-09-10',
    });
  });

  it('clears a bound when its input is emptied, keeping the other', () => {
    const onChange = vi.fn();
    render(
      <CaseFiltersBar
        filters={{ date_from: '2026-09-10', date_to: '2026-09-12' }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Created from'), { target: { value: '' } });

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

  it('ANNOUNCES why they are disabled, not just dims them', () => {
    // A `title` on the wrapping div was the only carrier of the reason, and
    // assistive technology does not announce one on a non-interactive element:
    // a screen-reader user heard "Created from, edit text, dimmed" and nothing
    // more, and a keyboard-only sighted user could not hover it either.
    render(<CaseFiltersBar filters={{ search: 'payment' }} onChange={vi.fn()} />);

    const from = screen.getByLabelText('Created from');
    const describedBy = from.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toMatch(
      /do not apply to a text search/i,
    );
    // The sighted-hover path keeps working too.
    expect(from).toHaveAttribute('title', expect.stringContaining('do not apply'));
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
