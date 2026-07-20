import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/api', () => ({
  shareCaseWithTeam: vi.fn().mockResolvedValue(undefined),
  unshareCaseFromTeam: vi.fn().mockResolvedValue(undefined),
}));

import { ShareCaseModal } from '../../components/ShareCaseModal';
import { shareCaseWithTeam, unshareCaseFromTeam } from '../../lib/api';
import type { Team } from '../../types/cases';

const TEAMS: Team[] = [
  { team_id: 't1', name: 'SRE', organization_id: 'o1' },
  { team_id: 't2', name: 'Platform', organization_id: 'o1' },
];

const mockShare = shareCaseWithTeam as ReturnType<typeof vi.fn>;
const mockUnshare = unshareCaseFromTeam as ReturnType<typeof vi.fn>;

describe('ShareCaseModal (ADR-013 §D4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when closed', () => {
    const { container } = render(
      <ShareCaseModal
        isOpen={false}
        caseId="c1"
        sharedTeamIds={[]}
        teams={TEAMS}
        onClose={() => {}}
        onChanged={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('reflects the current share state per team', () => {
    render(
      <ShareCaseModal
        isOpen
        caseId="c1"
        sharedTeamIds={['t1']}
        teams={TEAMS}
        onClose={() => {}}
        onChanged={() => {}}
      />
    );
    // t1 is already shared, t2 is not.
    expect(screen.getByRole('button', { name: 'Shared ✓' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Share' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shares an unshared team and notifies the parent', async () => {
    const onChanged = vi.fn();
    render(
      <ShareCaseModal
        isOpen
        caseId="c1"
        sharedTeamIds={[]}
        teams={[TEAMS[0]]}
        onClose={() => {}}
        onChanged={onChanged}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(mockShare).toHaveBeenCalledWith('c1', 't1'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('unshares an already-shared team', async () => {
    render(
      <ShareCaseModal
        isOpen
        caseId="c1"
        sharedTeamIds={['t1']}
        teams={[TEAMS[0]]}
        onClose={() => {}}
        onChanged={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Shared ✓' }));

    await waitFor(() => expect(mockUnshare).toHaveBeenCalledWith('c1', 't1'));
  });

  it('reverts optimistic state and surfaces an error on failure', async () => {
    mockShare.mockRejectedValueOnce(new Error('not a team member'));
    render(
      <ShareCaseModal
        isOpen
        caseId="c1"
        sharedTeamIds={[]}
        teams={[TEAMS[0]]}
        onClose={() => {}}
        onChanged={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(screen.getByText('not a team member')).toBeInTheDocument());
    // Reverted back to the unshared affordance.
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('tells the user when they belong to no teams', () => {
    render(
      <ShareCaseModal
        isOpen
        caseId="c1"
        sharedTeamIds={[]}
        teams={[]}
        onClose={() => {}}
        onChanged={() => {}}
      />
    );
    expect(screen.getByText(/don't belong to any teams/i)).toBeInTheDocument();
  });
});
