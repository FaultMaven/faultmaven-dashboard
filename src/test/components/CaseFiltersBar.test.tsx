import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CaseFiltersBar } from '../../components/CaseFiltersBar';
import type { Team } from '../../types/cases';

const TEAMS: Team[] = [
  { team_id: 't1', name: 'SRE', organization_id: 'o1' },
  { team_id: 't2', name: 'Platform', organization_id: 'o1' },
];

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
