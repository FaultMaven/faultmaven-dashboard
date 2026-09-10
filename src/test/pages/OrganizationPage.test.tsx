import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import OrganizationPage from '../../pages/OrganizationPage';

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
  addOrgMember: vi.fn(),
  setOrgMemberRole: vi.fn(),
  removeOrgMember: vi.fn(),
}));

import { getOrganization, listOrgMembers, setOrgMemberRole } from '../../lib/organization';

const mockGetOrg = getOrganization as ReturnType<typeof vi.fn>;
const mockListMembers = listOrgMembers as ReturnType<typeof vi.fn>;
const mockSetRole = setOrgMemberRole as ReturnType<typeof vi.fn>;

const ORG = {
  organization_id: 'o1',
  enterprise_id: 'ent-1',
  name: 'Acme',
  slug: 'acme',
  description: null,
  member_count: 1,
};
const MEMBERS = [
  {
    user_id: 'user-1',
    organization_id: 'o1',
    enterprise_id: 'ent-1',
    role: 'admin',
    joined_at: '2026-01-01T00:00:00Z',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <OrganizationPage />
    </MemoryRouter>
  );
}

describe('OrganizationPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the billing organization, its member, and the enterprise beside it', async () => {
    mockGetOrg.mockResolvedValue({ ...ORG, description: 'the billing org' });
    mockListMembers.mockResolvedValue(MEMBERS);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByText('user-1')).toBeInTheDocument();
    // Named separately, never merged with the organization: one is who pays,
    // the other is who is isolated from whom (ADR-017 D1/D2).
    expect(screen.getByText('Enterprise')).toBeInTheDocument();
    expect(screen.getByText('ent-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add member' })).toBeInTheDocument();
  });

  it('labels the role control as a MANAGEMENT role, not a permission over data', async () => {
    mockGetOrg.mockResolvedValue(ORG);
    mockListMembers.mockResolvedValue(MEMBERS);

    renderPage();

    expect(await screen.findByLabelText('Management role for user-1')).toBeInTheDocument();
  });

  it('renders the empty state — not an error — when the caller is in no organization', async () => {
    // The cloud console answers 404 for an account nobody pays for, which today
    // is every beta account (ADR-017 D5). The client turns that into `null`, and
    // the page has to render it as a state of the product, not a failure.
    mockGetOrg.mockResolvedValue(null);
    mockListMembers.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('No billing organization yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument();
    // Nothing on the page reports a failure.
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it('says teams are unaffected by having no organization', async () => {
    mockGetOrg.mockResolvedValue(null);
    mockListMembers.mockResolvedValue([]);

    renderPage();

    // The point of D2: not paying does not stop you sharing.
    expect(await screen.findByText(/start a team whenever you like/i)).toBeInTheDocument();
  });

  it('renders NO team management at all — that surface moved and cloud deleted it', async () => {
    mockGetOrg.mockResolvedValue(ORG);
    mockListMembers.mockResolvedValue(MEMBERS);

    renderPage();
    await screen.findByRole('heading', { name: 'Acme' });

    expect(screen.queryByRole('button', { name: 'Create team' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Teams' })).not.toBeInTheDocument();
  });

  it('a transient post-mutation refetch failure banners, and a later success clears it', async () => {
    mockGetOrg.mockResolvedValueOnce(ORG);
    mockListMembers.mockResolvedValueOnce(MEMBERS);
    mockSetRole.mockResolvedValue({ ...MEMBERS[0], role: 'member' });

    renderPage();
    const roleSelect = await screen.findByLabelText('Management role for user-1');

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
});
