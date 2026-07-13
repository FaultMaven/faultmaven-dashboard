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
import { getCaseMessages, getAdminCases } from './api';

const mockRequest = makeAuthenticatedRequest as ReturnType<typeof vi.fn>;

function msg(i: number): CaseMessage {
  return {
    message_id: `m${i}`,
    case_id: 'case_x',
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `msg ${i}`,
    created_at: new Date(i).toISOString(),
  };
}

function page(messages: CaseMessage[], total: number): { json: () => Promise<CaseMessagesResponse> } {
  return { json: async () => ({ messages, total_count: total }) };
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
