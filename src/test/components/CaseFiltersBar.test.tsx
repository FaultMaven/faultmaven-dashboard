import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CaseFiltersBar } from '../../components/CaseFiltersBar';
import type { CaseFilters, Team } from '../../types/cases';

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

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        state: 'resolved',
        source: 'copilot',
        search: 'payment',
      })
    );
  });

  it('clears the search key when the query is emptied', async () => {
    const onChange = vi.fn();
    render(<CaseFiltersBar filters={{ state: 'investigating' }} onChange={onChange} />);

    const input = screen.getByLabelText('Search cases');
    fireEvent.change(input, { target: { value: 'db' } });
    fireEvent.change(input, { target: { value: '' } });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ state: 'investigating', search: undefined })
    );
  });

  it('applies a state chip without dropping an existing search term', () => {
    const onChange = vi.fn();
    render(<CaseFiltersBar filters={{ search: 'db' }} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));

    expect(onChange).toHaveBeenCalledWith({ search: 'db', state: 'resolved' });
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
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ team_id: 't2' }));

    fireEvent.change(screen.getByLabelText('Filter by team'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ team_id: undefined }));
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

    expect(onChange).toHaveBeenCalledWith({ state: 'resolved', date_from: '2026-09-10' });
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

    expect(onChange).toHaveBeenCalledWith({ date_from: undefined, date_to: '2026-09-12' });
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

  it('DISABLES the dates while search results are showing', () => {
    // `POST /cases/search` accepts a query, a limit and a team — no date bounds.
    // An enabled input there would be #51 again in a narrower window: accepted,
    // dropped, and indistinguishable from a range that matched nothing.
    render(<CaseFiltersBar filters={{ search: 'payment' }} onChange={vi.fn()} searchMode />);

    expect(screen.getByLabelText('Created from')).toBeDisabled();
    expect(screen.getByLabelText('Created to')).toBeDisabled();
    // And it says why, rather than just going grey. The explanation sits on the
    // GROUP, because a disabled input is not a hover target in every browser —
    // the wrapper is, and it is what carries the label and the dimming too.
    const group = screen.getByLabelText('Created from').closest('div');
    expect(group).toHaveAttribute(
      'title',
      expect.stringContaining('do not apply to a text search'),
    );
    expect(group).toHaveClass('opacity-50');
  });

  it('KEEPS the range while disabled, so clearing the search restores it', () => {
    // Clearing the bounds on the first keystroke would silently discard the
    // user's range; they are meant to come back when the search box empties.
    const filters: CaseFilters = { date_from: '2026-09-10', search: 'payment' };
    const { rerender } = render(
      <CaseFiltersBar filters={filters} onChange={vi.fn()} searchMode />,
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
