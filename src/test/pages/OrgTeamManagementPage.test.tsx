import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import OrgTeamManagementPage from '../../pages/OrgTeamManagementPage';
import { APIError } from '../../lib/knowledge/errors';

vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  config: { apiUrl: 'http://localhost:8090' },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({ clearAuthState: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// PageHeader pulls in the nav (which fetches capabilities); stub it out.
vi.mock('../../hooks/useNavigationItems', () => ({
  useNavigationItems: vi.fn().mockReturnValue([]),
}));

vi.mock('../../lib/organization', () => ({
  getOrganization: vi.fn(),
  listOrgMembers: vi.fn(),
  updateOrganization: vi.fn(),
  inviteOrgMember: vi.fn(),
  setOrgMemberRole: vi.fn(),
  removeOrgMember: vi.fn(),
}));

vi.mock('../../lib/teams', () => ({
  listAdminTeams: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  deleteTeam: vi.fn(),
  listTeamMembers: vi.fn(),
  addTeamMember: vi.fn(),
  removeTeamMember: vi.fn(),
}));

import { getOrganization, listOrgMembers, setOrgMemberRole } from '../../lib/organization';
import { listAdminTeams } from '../../lib/teams';

const mockGetOrg = getOrganization as ReturnType<typeof vi.fn>;
const mockListMembers = listOrgMembers as ReturnType<typeof vi.fn>;
const mockSetRole = setOrgMemberRole as ReturnType<typeof vi.fn>;
const mockListTeams = listAdminTeams as ReturnType<typeof vi.fn>;

const ORG = {
  organization_id: 'o1',
  name: 'Acme',
  slug: 'acme',
  description: null,
  member_count: 1,
};
const MEMBERS = [{ user_id: 'user-1', role: 'admin', joined_at: '2026-01-01T00:00:00Z' }];

function renderPage() {
  return render(
    <MemoryRouter>
      <OrgTeamManagementPage />
    </MemoryRouter>
  );
}

describe('OrgTeamManagementPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads and renders the organization, a member, and a team', async () => {
    mockGetOrg.mockResolvedValue({
      organization_id: 'o1',
      name: 'Acme',
      slug: 'acme',
      description: 'infra org',
      member_count: 1,
    });
    mockListMembers.mockResolvedValue([
      { user_id: 'user-1', role: 'admin', joined_at: '2026-01-01T00:00:00Z' },
    ]);
    mockListTeams.mockResolvedValue([
      { team_id: 't1', name: 'SRE', description: null, organization_id: 'o1' },
    ]);

    renderPage();

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('user-1')).toBeInTheDocument();
    expect(screen.getByText('SRE')).toBeInTheDocument();
    // Panels rendered.
    expect(screen.getByRole('button', { name: 'Add member' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create team' })).toBeInTheDocument();
  });

  it('a transient post-mutation refetch failure banners, and a later success clears it', async () => {
    // Initial load succeeds.
    mockGetOrg.mockResolvedValueOnce(ORG);
    mockListMembers.mockResolvedValueOnce(MEMBERS);
    mockListTeams.mockResolvedValue([]);
    mockSetRole.mockResolvedValue({ ...MEMBERS[0], role: 'member' });

    renderPage();
    const roleSelect = await screen.findByLabelText('Role for user-1');

    // 1st role change: write OK, but the follow-up refetch fails → page banner.
    mockGetOrg.mockRejectedValueOnce(new Error('network blip'));
    mockListMembers.mockRejectedValueOnce(new Error('network blip'));
    fireEvent.change(roleSelect, { target: { value: 'member' } });
    expect(await screen.findByText('network blip')).toBeInTheDocument();

    // 2nd role change: write OK and the refetch succeeds → the stale banner clears.
    mockGetOrg.mockResolvedValueOnce(ORG);
    mockListMembers.mockResolvedValueOnce(MEMBERS);
    fireEvent.change(roleSelect, { target: { value: 'viewer' } });
    await waitFor(() => expect(screen.queryByText('network blip')).not.toBeInTheDocument());
  });

  it('shows a friendly banner when the service is unavailable (503)', async () => {
    mockGetOrg.mockRejectedValue(new APIError('nope', 503));
    mockListMembers.mockRejectedValue(new APIError('nope', 503));
    mockListTeams.mockRejectedValue(new APIError('nope', 503));

    renderPage();

    expect(
      await screen.findByText(/not available in this deployment/i)
    ).toBeInTheDocument();
  });
});
