// Organization admin console client tests (/api/v1/admin/organization/*, U13c).

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/knowledge/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/knowledge/client')>(
    '../../lib/knowledge/client'
  );
  return { ...actual, makeAuthenticatedRequest: vi.fn() };
});
vi.mock('../../lib/knowledge/errors', () => ({ handleAPIResponse: vi.fn() }));

import { makeAuthenticatedRequest } from '../../lib/knowledge/client';
import {
  getOrganization,
  updateOrganization,
  listOrgMembers,
  inviteOrgMember,
  setOrgMemberRole,
  removeOrgMember,
} from '../../lib/organization';

const mockRequest = makeAuthenticatedRequest as ReturnType<typeof vi.fn>;
const jsonResponse = (body: unknown) => ({ json: async () => body });

describe('organization admin client', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getOrganization GETs the org base', async () => {
    const org = { organization_id: 'o1', name: 'Acme', slug: 'acme', member_count: 3 };
    mockRequest.mockResolvedValueOnce(jsonResponse(org));

    const res = await getOrganization();

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/organization');
    expect(res).toEqual(org);
  });

  it('updateOrganization PATCHes name/description', async () => {
    const org = { organization_id: 'o1', name: 'Acme 2', slug: 'acme', member_count: 3 };
    mockRequest.mockResolvedValueOnce(jsonResponse(org));

    await updateOrganization({ name: 'Acme 2', description: 'infra' });

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/organization', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme 2', description: 'infra' }),
    });
  });

  it('listOrgMembers GETs /members', async () => {
    const members = [{ user_id: 'u1', role: 'admin', joined_at: '2026-01-01T00:00:00Z' }];
    mockRequest.mockResolvedValueOnce(jsonResponse(members));

    const res = await listOrgMembers();

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/organization/members');
    expect(res).toEqual(members);
  });

  it('inviteOrgMember POSTs the identifier + role', async () => {
    const member = { user_id: 'u2', role: 'member', joined_at: '2026-01-02T00:00:00Z' };
    mockRequest.mockResolvedValueOnce(jsonResponse(member));

    await inviteOrgMember({ email: 'a@b.com', role: 'member' });

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/organization/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', role: 'member' }),
    });
  });

  it('setOrgMemberRole PATCHes /members/{id} and url-encodes the id', async () => {
    const member = { user_id: 'u/1', role: 'admin', joined_at: '2026-01-02T00:00:00Z' };
    mockRequest.mockResolvedValueOnce(jsonResponse(member));

    await setOrgMemberRole('u/1', 'admin');

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/organization/members/u%2F1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
  });

  it('removeOrgMember DELETEs /members/{id}', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(undefined));

    await removeOrgMember('u2');

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/organization/members/u2', {
      method: 'DELETE',
    });
  });
});
