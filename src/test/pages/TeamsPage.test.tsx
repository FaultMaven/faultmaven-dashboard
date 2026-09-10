import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TeamsPage from '../../pages/TeamsPage';
import { APIError } from '../../lib/knowledge/errors';

vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  config: { apiUrl: 'http://localhost:8090' },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({
    clearAuthState: vi.fn(),
    authState: { user: { user_id: 'me' } },
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// PageHeader pulls in the nav (which fetches capabilities); stub it out.
vi.mock('../../hooks/useNavigationItems', () => ({
  useNavigationItems: vi.fn().mockReturnValue([]),
}));

// Only the network calls are stubbed. `teamRefusalReason` and the refusal copy
// stay REAL, because what these tests are checking is that a slug the backend
// sends becomes the sentence a person reads — mocking that away would leave the
// assertions checking a fixture against itself.
vi.mock('../../lib/teams', async () => {
  const actual = await vi.importActual<typeof import('../../lib/teams')>('../../lib/teams');
  return {
    ...actual,
    listTeams: vi.fn(),
    createTeam: vi.fn(),
    listTeamMembers: vi.fn(),
    leaveTeam: vi.fn(),
    inviteToTeam: vi.fn(),
    listTeamInvitations: vi.fn(),
    revokeTeamInvitation: vi.fn(),
    listMyInvitations: vi.fn(),
    acceptInvitation: vi.fn(),
    declineInvitation: vi.fn(),
  };
});

import {
  acceptInvitation,
  createTeam,
  declineInvitation,
  inviteToTeam,
  leaveTeam,
  listMyInvitations,
  listTeamInvitations,
  listTeamMembers,
  listTeams,
  revokeTeamInvitation,
} from '../../lib/teams';

const mockListTeams = listTeams as ReturnType<typeof vi.fn>;
const mockCreateTeam = createTeam as ReturnType<typeof vi.fn>;
const mockListMembers = listTeamMembers as ReturnType<typeof vi.fn>;
const mockLeaveTeam = leaveTeam as ReturnType<typeof vi.fn>;
const mockInvite = inviteToTeam as ReturnType<typeof vi.fn>;
const mockListTeamInvitations = listTeamInvitations as ReturnType<typeof vi.fn>;
const mockRevoke = revokeTeamInvitation as ReturnType<typeof vi.fn>;
const mockListMyInvitations = listMyInvitations as ReturnType<typeof vi.fn>;
const mockAccept = acceptInvitation as ReturnType<typeof vi.fn>;
const mockDecline = declineInvitation as ReturnType<typeof vi.fn>;

const TEAM = { team_id: 't1', name: 'SRE', description: null, enterprise_id: 'ent-1' };

const ADMIN_ROSTER = [
  { user_id: 'me', team_id: 't1', team_role: 'admin', joined_at: '2026-01-01T00:00:00Z' },
  { user_id: 'other', team_id: 't1', team_role: 'member', joined_at: '2026-01-02T00:00:00Z' },
];
const MEMBER_ROSTER = [
  { user_id: 'me', team_id: 't1', team_role: 'member', joined_at: '2026-01-01T00:00:00Z' },
];

/** A refusal exactly as `handleAPIResponse` throws one: the slug is on `details`. */
function refusal(status: number, reason: string, detail: string) {
  return new APIError(detail, status, undefined, { error: 'Refused', detail, status_code: status, reason });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TeamsPage />
    </MemoryRouter>
  );
}

/** Open a team card, which is what loads its roster and invitations. */
async function expandTeam() {
  fireEvent.click(await screen.findByRole('button', { name: 'Members' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListTeams.mockResolvedValue([TEAM]);
  mockListMyInvitations.mockResolvedValue([]);
  mockListMembers.mockResolvedValue(ADMIN_ROSTER);
  mockListTeamInvitations.mockResolvedValue([]);
});

describe('TeamsPage', () => {
  it('lists the caller’s teams and never mentions an organization', async () => {
    renderPage();

    expect(await screen.findByText('SRE')).toBeInTheDocument();
    // The whole point of the split: sharing is a team question, and who pays is
    // not on this page at all (ADR-017 D2).
    expect(screen.queryByText(/organi[sz]ation/i)).not.toBeInTheDocument();
  });

  it('creates a team and re-reads the list', async () => {
    mockCreateTeam.mockResolvedValue({ ...TEAM, team_id: 't2', name: 'Platform' });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Create team' }));
    fireEvent.change(screen.getByLabelText('New team name'), { target: { value: 'Platform' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mockCreateTeam).toHaveBeenCalledWith({ name: 'Platform', description: null })
    );
    await waitFor(() => expect(mockListTeams).toHaveBeenCalledTimes(2));
  });

  it('surfaces 409 team_name_taken as its own sentence, not the raw backend prose', async () => {
    mockCreateTeam.mockRejectedValue(
      refusal(409, 'team_name_taken', 'A team with that name already exists in this enterprise.')
    );

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Create team' }));
    fireEvent.change(screen.getByLabelText('New team name'), { target: { value: 'SRE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('You already have a team with that name.')).toBeInTheDocument();
  });

  it('caps the team name field at the contract’s 200 characters', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Create team' }));

    expect(screen.getByLabelText('New team name')).toHaveAttribute('maxlength', '200');
  });

  describe('the team admin’s half', () => {
    it('shows the roster and the invite form to an admin', async () => {
      renderPage();
      await expandTeam();

      expect(await screen.findByLabelText('Invite someone to SRE')).toBeInTheDocument();
      expect(screen.getByText('other')).toBeInTheDocument();
    });

    it('shows NO invite form to a plain member, and asks for no invitation list', async () => {
      // Team admin is a property of the caller's own membership row, not of a
      // deployment role — and the invitation list is the admin's to read, so a
      // member must not even request it.
      mockListMembers.mockResolvedValue(MEMBER_ROSTER);

      renderPage();
      await expandTeam();

      await screen.findByText('me');
      expect(screen.queryByLabelText('Invite someone to SRE')).not.toBeInTheDocument();
      expect(mockListTeamInvitations).not.toHaveBeenCalled();
    });

    it('invites an address and re-reads the pending list', async () => {
      mockInvite.mockResolvedValue({
        invitation_id: 'i1',
        team_id: 't1',
        email: 'a@acme.com',
        status: 'pending',
      });
      mockListTeamInvitations
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { invitation_id: 'i1', team_id: 't1', email: 'a@acme.com', status: 'pending' },
        ]);

      renderPage();
      await expandTeam();
      const field = await screen.findByLabelText('Invite someone to SRE');
      fireEvent.change(field, { target: { value: 'a@acme.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

      await waitFor(() =>
        expect(mockInvite).toHaveBeenCalledWith('t1', { email: 'a@acme.com' })
      );
      expect(await screen.findByText('a@acme.com')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
    });

    it.each([
      [
        'address_outside_enterprise_domain',
        403,
        'You can only invite people whose email address is on your company’s domain.',
      ],
      ['already_a_member', 409, 'That person is already on this team.'],
    ])('renders the %s refusal from the slug', async (reason, status, sentence) => {
      mockInvite.mockRejectedValue(refusal(status, reason, 'backend prose nobody should read'));

      renderPage();
      await expandTeam();
      fireEvent.change(await screen.findByLabelText('Invite someone to SRE'), {
        target: { value: 'a@elsewhere.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

      expect(await screen.findByText(sentence)).toBeInTheDocument();
      expect(screen.queryByText('backend prose nobody should read')).not.toBeInTheDocument();
    });

    it('replaces the invite form with the island sentence on enterprise_is_personal', async () => {
      // ADR-017 D3/D4: an account on a personal email domain gets an enterprise
      // of its own, so there is nobody in it to invite. Nothing on `/auth/me`
      // says so — there is no enterprise on the profile at all — which is why
      // this is rendered from the API's refusal rather than guessed here.
      mockInvite.mockRejectedValue(
        refusal(403, 'enterprise_is_personal', 'This enterprise is personal.')
      );

      renderPage();
      await expandTeam();
      fireEvent.change(await screen.findByLabelText('Invite someone to SRE'), {
        target: { value: 'someone@gmail.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

      expect(
        await screen.findByText(/personal email address, so this account has no company to share/i)
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByLabelText('Invite someone to SRE')).not.toBeInTheDocument()
      );
    });

    it('withdraws a pending offer', async () => {
      mockListTeamInvitations.mockResolvedValue([
        { invitation_id: 'i1', team_id: 't1', email: 'a@acme.com', status: 'pending' },
      ]);
      mockRevoke.mockResolvedValue(undefined);

      renderPage();
      await expandTeam();
      fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));

      await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('t1', 'i1'));
    });

    it('renders a 410 on withdraw as "expired", not as a failed withdrawal', async () => {
      mockListTeamInvitations.mockResolvedValue([
        { invitation_id: 'i1', team_id: 't1', email: 'a@acme.com', status: 'pending' },
      ]);
      mockRevoke.mockRejectedValue(
        refusal(410, 'invitation_expired', 'This invitation has already expired.')
      );

      renderPage();
      await expandTeam();
      fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));

      expect(await screen.findByText('This invitation has expired.')).toBeInTheDocument();
    });
  });

  describe('leaving', () => {
    /** Open the card's Leave, then confirm in the dialog it raises. */
    async function confirmLeave() {
      fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
      // Two "Leave" buttons now exist: the card's and the dialog's confirm. The
      // dialog is rendered after the card, so it is the second.
      const buttons = await screen.findAllByRole('button', { name: 'Leave' });
      fireEvent.click(buttons[buttons.length - 1]);
    }

    it('leaves the team and re-reads the list', async () => {
      mockLeaveTeam.mockResolvedValue(undefined);

      renderPage();
      await confirmLeave();

      await waitFor(() => expect(mockLeaveTeam).toHaveBeenCalledWith('t1'));
      await waitFor(() => expect(mockListTeams).toHaveBeenCalledTimes(2));
    });

    it('surfaces the last-admin refusal as the reason it is', async () => {
      mockLeaveTeam.mockRejectedValue(
        refusal(409, 'last_admin_cannot_leave', 'Last admin cannot leave.')
      );

      renderPage();
      await confirmLeave();

      expect(await screen.findByText(/only admin of this team/i)).toBeInTheDocument();
    });
  });

  describe('the invitee’s half', () => {
    const OFFER = {
      invitation_id: 'i9',
      team_id: 't9',
      team_name: 'Platform',
      email: 'me@acme.com',
      status: 'pending',
    };

    it('accepts an offer — the only call that creates a membership', async () => {
      mockListMyInvitations.mockResolvedValue([OFFER]);
      // 200 answers the TEAM just joined, not the spent offer.
      mockAccept.mockResolvedValue({ ...TEAM, team_id: 't9', name: 'Platform' });

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

      await waitFor(() => expect(mockAccept).toHaveBeenCalledWith('i9'));
      // Accepting adds a team, so the team list is re-read as well.
      await waitFor(() => expect(mockListTeams).toHaveBeenCalledTimes(2));
    });

    it('declines an offer', async () => {
      mockListMyInvitations.mockResolvedValue([OFFER]);
      mockDecline.mockResolvedValue(undefined);

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));

      await waitFor(() => expect(mockDecline).toHaveBeenCalledWith('i9'));
    });

    it('renders a 410 on accept as a plain note, never as an error banner', async () => {
      mockListMyInvitations.mockResolvedValue([OFFER]);
      mockAccept.mockRejectedValue(
        refusal(410, 'invitation_expired', 'This invitation has already expired.')
      );

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

      const note = await screen.findByText('This invitation has expired.');
      expect(note).toBeInTheDocument();
      // Not in the page's critical banner — nobody did anything wrong.
      expect(note.className).not.toContain('fm-critical');
    });

    it('shows no invitations section when there are none', async () => {
      renderPage();
      await screen.findByText('SRE');

      expect(screen.queryByText('Invitations for you')).not.toBeInTheDocument();
    });
  });
});
