import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TeamShareBadge } from '../../components/TeamShareBadge';

describe('TeamShareBadge', () => {
  it('renders nothing when the case is shared with no team', () => {
    const { container } = render(<TeamShareBadge teamIds={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the team name for a single share when known', () => {
    render(
      <TeamShareBadge teamIds={['t1']} teamsById={new Map([['t1', 'SRE']])} />
    );
    expect(screen.getByText('SRE')).toBeInTheDocument();
  });

  it('falls back to a generic label when the id is unknown', () => {
    render(<TeamShareBadge teamIds={['t9']} />);
    expect(screen.getByText('Team')).toBeInTheDocument();
  });

  it('collapses multiple shares to a count and lists known names in the tooltip', () => {
    render(
      <TeamShareBadge
        teamIds={['t1', 't2']}
        teamsById={new Map([['t1', 'SRE'], ['t2', 'Platform']])}
      />
    );
    expect(screen.getByText('2 teams')).toBeInTheDocument();
    expect(screen.getByTitle('Shared with SRE, Platform')).toBeInTheDocument();
  });
});
