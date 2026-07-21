import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CaseFiltersBar } from '../../components/CaseFiltersBar';
import type { CaseFilters, Team } from '../../types/cases';

const TEAMS: Team[] = [
  { team_id: 't1', name: 'SRE', organization_id: 'o1' },
  { team_id: 't2', name: 'Platform', organization_id: 'o1' },
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
