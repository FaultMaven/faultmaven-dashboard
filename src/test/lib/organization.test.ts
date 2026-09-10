// Billing-organization console client tests — cloud `/api/v1/admin/organization*`
// at cloud contract 2.0.0 (ADR-017 D5).
//
// `handleAPIResponse` is mocked out, so a test that wants a refusal has to make
// the client's OWN branch fire: the 404 arm is the client's, not the helper's.

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
  addOrgMember,
  setOrgMemberRole,
  removeOrgMember,
} from '../../lib/organization';

const mockRequest = makeAuthenticatedRequest as ReturnType<typeof vi.fn>;
const jsonResponse = (body: unknown) => ({ status: 200, json: async () => body });
const notFound = () => ({
  status: 404,
  json: async () => ({ detail: 'No organization' }),
});

describe('billing organization client', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getOrganization GETs the org base and carries the enterprise beside it', async () => {
    const org = {
      organization_id: 'o1',
      enterprise_id: 'ent-1',
      name: 'Acme',
      slug: 'acme',
      member_count: 3,
    };
    mockRequest.mockResolvedValueOnce(jsonResponse(org));

    const res = await getOrganization();

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/organization');
    expect(res).toEqual(org);
    expect(res?.enterprise_id).toBe('ent-1');
  });

  it('getOrganization returns null on 404 — being in no organization is normal', async () => {
    // Every beta account is in none (ADR-017 D5), so a client that let this
    // reach `handleAPIResponse` would throw at every user of the product.
    mockRequest.mockResolvedValueOnce(notFound());

    await expect(getOrganization()).resolves.toBeNull();
  });

  it('listOrgMembers returns [] on the same 404', async () => {
    mockRequest.mockResolvedValueOnce(notFound());

    await expect(listOrgMembers()).resolves.toEqual([]);
  });

  it('updateOrganization PATCHes name/description', async () => {
    const org = {
      organization_id: 'o1',
      enterprise_id: 'ent-1',
      name: 'Acme 2',
      slug: 'acme',
      member_count: 3,
    };
    mockRequest.mockResolvedValueOnce(jsonResponse(org));

    await updateOrganization({ name: 'Acme 2', description: 'infra' });

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/organization', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme 2', description: 'infra' }),
    });
  });

  it('listOrgMembers GETs /members', async () => {
    const members = [
      {
        user_id: 'u1',
        organization_id: 'o1',
        enterprise_id: 'ent-1',
        role: 'admin',
        joined_at: '2026-01-01T00:00:00Z',
      },
    ];
    mockRequest.mockResolvedValueOnce(jsonResponse(members));

    const res = await listOrgMembers();

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/organization/members');
    expect(res).toEqual(members);
  });

  it('addOrgMember POSTs the identifier + management role', async () => {
    const member = {
      user_id: 'u2',
      organization_id: 'o1',
      enterprise_id: 'ent-1',
      role: 'member',
      joined_at: '2026-01-02T00:00:00Z',
    };
    mockRequest.mockResolvedValueOnce(jsonResponse(member));

    await addOrgMember({ email: 'a@b.com', role: 'member' });

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/organization/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', role: 'member' }),
    });
  });

  it('setOrgMemberRole PATCHes /members/{id} and url-encodes the id', async () => {
    const member = {
      user_id: 'u/1',
      organization_id: 'o1',
      enterprise_id: 'ent-1',
      role: 'admin',
      joined_at: '2026-01-02T00:00:00Z',
    };
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
