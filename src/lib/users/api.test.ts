// User-management API tests — real backend RBAC endpoints (D3).

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../knowledge/client', async () => {
  const actual = await vi.importActual<typeof import('../knowledge/client')>(
    '../knowledge/client'
  );
  return {
    ...actual,
    makeAuthenticatedRequest: vi.fn(),
  };
});
vi.mock('../knowledge/errors', () => ({
  handleAPIResponse: vi.fn(),
}));

import { makeAuthenticatedRequest } from '../knowledge/client';
import * as usersApi from './api';
import { listUsers, updateUserRole, deactivateUser } from './api';

const mockRequest = makeAuthenticatedRequest as ReturnType<typeof vi.fn>;

describe('users API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listUsers paginates by limit/offset', async () => {
    mockRequest.mockResolvedValueOnce({ json: async () => ({ users: [], total: 0, limit: 50, offset: 100 }) });

    await listUsers(2, 50);

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/users?limit=50&offset=100');
  });

  // Promote → POST /roles {role:'admin'} (replaces roles on the backend).
  it('updateUserRole to admin POSTs the roles endpoint', async () => {
    mockRequest.mockResolvedValueOnce({ json: async () => ({}) });

    await updateUserRole('u1', { role: 'admin' });

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/v1/admin/users/u1/roles',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ role: 'admin' }),
      })
    );
  });

  // Demote → DELETE /roles/admin (backend downgrades to viewer).
  it('updateUserRole to user DELETEs the admin role', async () => {
    mockRequest.mockResolvedValueOnce({ json: async () => ({}) });

    await updateUserRole('u1', { role: 'user' });

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/v1/admin/users/u1/roles/admin',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('deactivateUser POSTs the deactivate endpoint', async () => {
    mockRequest.mockResolvedValueOnce({ json: async () => ({}) });

    await deactivateUser('u1');

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/v1/admin/users/u1/deactivate',
      expect.objectContaining({ method: 'POST' })
    );
  });

  // D3: no FaultMaven invite endpoint — provisioning moves to the IdP/SCIM.
  it('exposes no invite/remove surface', () => {
    expect('inviteUser' in usersApi).toBe(false);
    expect('removeUser' in usersApi).toBe(false);
  });
});
