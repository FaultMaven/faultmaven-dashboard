// Cases API tests — transcript pagination.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CaseMessage, CaseMessagesResponse } from '../../types/cases';

// Mock the request + response helpers the cases API depends on. We keep the
// real buildQueryParams so the asserted URLs reflect actual query encoding.
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
import {
  getCaseMessages,
  getAdminCases,
  listCases,
  searchCases,
  shareCaseWithTeam,
  unshareCaseFromTeam,
} from './api';

const mockRequest = makeAuthenticatedRequest as ReturnType<typeof vi.fn>;

function msg(i: number): CaseMessage {
  // Backend-real Message shape: no `case_id`, `turn_number` present.
  return {
    message_id: `m${i}`,
    turn_number: Math.floor(i / 2) + 1,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `msg ${i}`,
    created_at: new Date(i).toISOString(),
  };
}

function page(messages: CaseMessage[], total: number): { json: () => Promise<CaseMessagesResponse> } {
  return {
    json: async () => ({
      messages,
      total_count: total,
      retrieved_count: messages.length,
      has_more: false,
    }),
  };
}

describe('getCaseMessages pagination', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a single page unchanged when the case fits in one request', async () => {
    const all = Array.from({ length: 12 }, (_, i) => msg(i));
    mockRequest.mockResolvedValueOnce(page(all, 12));

    const res = await getCaseMessages('case_x');

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith('/api/v1/cases/case_x/messages?limit=100&offset=0');
    expect(res.messages).toHaveLength(12);
    expect(res.total_count).toBe(12);
    expect(res.retrieved_count).toBe(12);
  });

  it('pages through every chunk and concatenates in order for a long transcript', async () => {
    // 250 messages => 3 requests (100 + 100 + 50).
    const total = 250;
    const all = Array.from({ length: total }, (_, i) => msg(i));
    mockRequest
      .mockResolvedValueOnce(page(all.slice(0, 100), total))
      .mockResolvedValueOnce(page(all.slice(100, 200), total))
      .mockResolvedValueOnce(page(all.slice(200, 250), total));

    const res = await getCaseMessages('case_x');

    expect(mockRequest).toHaveBeenCalledTimes(3);
    expect(mockRequest).toHaveBeenNthCalledWith(1, '/api/v1/cases/case_x/messages?limit=100&offset=0');
    expect(mockRequest).toHaveBeenNthCalledWith(2, '/api/v1/cases/case_x/messages?limit=100&offset=100');
    expect(mockRequest).toHaveBeenNthCalledWith(3, '/api/v1/cases/case_x/messages?limit=100&offset=200');
    expect(res.messages).toHaveLength(total);
    expect(res.messages.map((m) => m.message_id)).toEqual(all.map((m) => m.message_id));
    expect(res.retrieved_count).toBe(total);
  });

  it('stops when a page returns fewer rows than requested (last page exactly full would still terminate via total)', async () => {
    // 74 messages (the live-case shape): one short page, single request.
    const all = Array.from({ length: 74 }, (_, i) => msg(i));
    mockRequest.mockResolvedValueOnce(page(all, 74));

    const res = await getCaseMessages('case_x');

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(res.messages).toHaveLength(74);
  });

  it('does not loop forever if total_count is overstated', async () => {
    // Server claims 500 but only returns 30 (short page) — must stop, not spin.
    const all = Array.from({ length: 30 }, (_, i) => msg(i));
    mockRequest.mockResolvedValueOnce(page(all, 500));

    const res = await getCaseMessages('case_x');

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(res.messages).toHaveLength(30);
  });
});

describe('getAdminCases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hits the admin endpoint with limit/offset pagination', async () => {
    mockRequest.mockResolvedValueOnce({
      json: async () => ({ cases: [], total_count: 0, has_more: false }),
    });

    await getAdminCases({}, 2, 20);

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/cases?limit=20&offset=40');
  });

  it('forwards the state filter', async () => {
    mockRequest.mockResolvedValueOnce({
      json: async () => ({ cases: [], total_count: 0, has_more: false }),
    });

    await getAdminCases({ state: 'investigating' }, 0, 20);

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/v1/admin/cases?limit=20&offset=0&state=investigating'
    );
  });

  it('forwards the source filter', async () => {
    mockRequest.mockResolvedValueOnce({
      json: async () => ({ cases: [], total_count: 0, has_more: false }),
    });

    await getAdminCases({ source: 'slack' }, 0, 20);

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/v1/admin/cases?limit=20&offset=0&source=slack'
    );
  });
});

describe('listCases', () => {
  beforeEach(() => vi.clearAllMocks());

  // Encodes the BACKEND-REAL contract: GET /cases paginates by limit/offset.
  // The old client sent page/page_size, which FastAPI silently dropped, so every
  // page returned the same first slice (cases 51+ were unreachable).
  it('paginates by limit/offset, not page/page_size', async () => {
    mockRequest.mockResolvedValueOnce({
      json: async () => ({ cases: [], total_count: 0, limit: 20, offset: 40, has_more: false }),
    });

    await listCases({}, 2, 20);

    const url = mockRequest.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/cases?limit=20&offset=40');
    expect(url).not.toContain('page=');
    expect(url).not.toContain('page_size=');
  });

  it('sends offset=0 for the first page', async () => {
    mockRequest.mockResolvedValueOnce({
      json: async () => ({ cases: [], total_count: 0, limit: 20, offset: 0, has_more: false }),
    });

    await listCases({}, 0, 20);

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/cases?limit=20&offset=0');
  });

  it('forwards state/source filters alongside limit/offset', async () => {
    mockRequest.mockResolvedValueOnce({
      json: async () => ({ cases: [], total_count: 0, limit: 20, offset: 0, has_more: false }),
    });

    await listCases({ state: 'resolved', source: 'copilot' }, 0, 20);

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/v1/cases?limit=20&offset=0&state=resolved&source=copilot'
    );
  });
});

describe('team filter + share (ADR-013 §D4)', () => {
  beforeEach(() => vi.clearAllMocks());

  // U12 team filter, adapted to PR #52's limit/offset contract (team_id rides
  // alongside limit/offset, not page/page_size).
  it('listCases forwards team_id as a query param', async () => {
    mockRequest.mockResolvedValueOnce({
      json: async () => ({ cases: [], total_count: 0, has_more: false }),
    });

    await listCases({ team_id: 'team_42' }, 0, 20);

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/v1/cases?limit=20&offset=0&team_id=team_42'
    );
  });

  it('listCases omits team_id when unset', async () => {
    mockRequest.mockResolvedValueOnce({
      json: async () => ({ cases: [], total_count: 0, has_more: false }),
    });

    await listCases({}, 0, 20);

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/cases?limit=20&offset=0');
  });

  it('shareCaseWithTeam POSTs the team id to the team-shares endpoint', async () => {
    mockRequest.mockResolvedValueOnce({ json: async () => ({}) });

    await shareCaseWithTeam('case_x', 'team_42');

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/v1/cases/case_x/team-shares',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ team_id: 'team_42' }),
      })
    );
  });

  it('unshareCaseFromTeam DELETEs the team-share sub-resource', async () => {
    mockRequest.mockResolvedValueOnce({ json: async () => ({}) });

    await unshareCaseFromTeam('case_x', 'team_42');

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/v1/cases/case_x/team-shares/team_42',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('searchCases', () => {
  beforeEach(() => vi.clearAllMocks());

  // Backend CaseSearchRequest supports only `limit` (max 100) — no page/offset.
  it('sends only query + limit (no page/page_size)', async () => {
    mockRequest.mockResolvedValueOnce({ json: async () => [] });

    await searchCases('database outage');

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/v1/cases/search',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse((mockRequest.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ query: 'database outage', limit: 100 });
    expect(body).not.toHaveProperty('page');
    expect(body).not.toHaveProperty('page_size');
  });

  it('honours a caller-supplied limit', async () => {
    mockRequest.mockResolvedValueOnce({ json: async () => [] });

    await searchCases('db', 25);

    const body = JSON.parse((mockRequest.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ query: 'db', limit: 25 });
  });

  // U12 team filter on search, adapted to PR #52's (query, limit, teamId)
  // signature: team_id rides in the body next to limit, no page/page_size.
  it('includes team_id in the body only when provided', async () => {
    mockRequest.mockResolvedValue({ json: async () => [] });

    await searchCases('disk full', 100, 'team_42');
    expect(mockRequest).toHaveBeenLastCalledWith(
      '/api/v1/cases/search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'disk full', limit: 100, team_id: 'team_42' }),
      })
    );

    await searchCases('disk full', 100);
    const body = JSON.parse((mockRequest.mock.calls[1][1] as RequestInit).body as string);
    expect(body).toEqual({ query: 'disk full', limit: 100 });
    expect(body).not.toHaveProperty('team_id');
  });
});
