import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import UserManagementPage from '../../pages/UserManagementPage';
import type { UserProfile, UserListResponse } from '../../types/users';

vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn().mockResolvedValue(undefined),
  listUsers: vi.fn(),
  inviteUser: vi.fn().mockResolvedValue(undefined),
  updateUserRole: vi.fn().mockResolvedValue(undefined),
  removeUser: vi.fn().mockResolvedValue(undefined),
  config: { apiUrl: 'http://localhost:8090' },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({
    deployment: 'standalone',
    role: 'individual',
    isAdmin: true,
    clearAuthState: vi.fn(),
    isAuthenticated: true,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useNavigationItems', () => ({
  useNavigationItems: vi.fn().mockReturnValue([
    { label: 'Users', path: '/admin/users', active: true },
  ]),
}));

import { listUsers } from '../../lib/api';

const mockListUsers = listUsers as ReturnType<typeof vi.fn>;

// Backend-real AdminUserListItem shape: `full_name`, `roles`, `last_login_at`,
// `is_active`, `is_verified` — and crucially NO `username`, `display_name`,
// `is_admin`, or `last_active_at`. The old hand-written type invented those.
const adminUser: UserProfile = {
  user_id: 'u-admin',
  organization_id: 'org1',
  email: 'ada@faultmaven.local',
  full_name: 'Ada Admin',
  roles: ['user', 'admin'],
  is_active: true,
  is_verified: true,
  last_login_at: '2026-07-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

const standardUser: UserProfile = {
  user_id: 'u-standard',
  organization_id: 'org1',
  email: 'stan@faultmaven.local',
  full_name: 'Stan Standard',
  roles: ['user'],
  is_active: true,
  is_verified: true,
  last_login_at: null,
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

const listResponse: UserListResponse = {
  users: [adminUser, standardUser],
  total: 2,
  limit: 50,
  offset: 0,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <UserManagementPage />
    </MemoryRouter>,
  );
}

describe('UserManagementPage — backend-real admin user shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListUsers.mockResolvedValue(listResponse);
  });

  it('shows the real user count from `total`', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.getByText('2 users')).toBeInTheDocument());
  });

  it('renders full_name and email for each user', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.getByText('Ada Admin')).toBeInTheDocument());
    expect(screen.getByText('Stan Standard')).toBeInTheDocument();
    expect(screen.getByText('ada@faultmaven.local')).toBeInTheDocument();
  });

  it('derives the role select from `roles`, not a phantom `is_admin`', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.getByText('Ada Admin')).toBeInTheDocument());
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    // Row order matches fixture: admin first, standard second.
    expect(selects[0].value).toBe('admin');
    expect(selects[1].value).toBe('user');
  });

  it('renders last_login_at (and an em-dash when never logged in)', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.getByText('Ada Admin')).toBeInTheDocument());
    // standardUser.last_login_at is null → em-dash placeholder.
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('searches by name/email without throwing on the missing `username`', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.getByText('Ada Admin')).toBeInTheDocument());

    const searchBox = screen.getByLabelText('Search users');
    // Before the fix this threw on `u.username.toLowerCase()` (undefined).
    await act(async () => {
      fireEvent.change(searchBox, { target: { value: 'stan' } });
    });

    expect(screen.getByText('Stan Standard')).toBeInTheDocument();
    expect(screen.queryByText('Ada Admin')).not.toBeInTheDocument();
  });

  it('requests the admin users endpoint by page (offset derives in the api layer)', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(mockListUsers).toHaveBeenCalled());
    expect(mockListUsers).toHaveBeenCalledWith(0, 50);
  });
});
