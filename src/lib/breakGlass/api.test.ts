// Break-glass API tests — operator transcript pagination (ADR-012 D9).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CaseMessage } from '../../types/cases';

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
import { openAdminCaseTranscript } from './api';

const mockRequest = makeAuthenticatedRequest as ReturnType<typeof vi.fn>;

const GRANT = {
  grant_id: 'grant-1',
  operator_user_id: 'op-1',
  target_case_id: 'case_a1b2c3d4e5f6',
  target_organization_id: 'org-acme',
  reason: 'customer reports the investigation is stuck; ticket SUP-4821',
  created_at: '2026-07-26T00:00:00Z',
  expires_at: '2026-07-26T01:00:00Z',
  approval_state: 'auto_approved',
  is_live: true,
};

function msg(i: number): CaseMessage {
  return {
    message_id: `m${i}`,
    turn_number: Math.floor(i / 2) + 1,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `msg ${i}`,
    created_at: new Date(i).toISOString(),
  };
}

function page(messages: CaseMessage[], total: number) {
  return {
    json: async () => ({
      access: 'break_glass',
      grant: GRANT,
      messages: {
        messages,
        total_count: total,
        retrieved_count: messages.length,
        has_more: messages.length < total,
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('openAdminCaseTranscript', () => {
  it('pages through the whole transcript, not just the first chunk', async () => {
    // The regression this pins: an unparameterised call takes the endpoint's
    // default of 50 messages, so an operator reviewing a long investigation
    // would silently see its opening and none of its conclusion — while the
    // owner, whose client pages, sees all of it. A truncated transcript is
    // worse than a refused one, because it looks complete.
    const total = 250;
    const all = Array.from({ length: total }, (_, i) => msg(i));
    mockRequest
      .mockResolvedValueOnce(page(all.slice(0, 100), total))
      .mockResolvedValueOnce(page(all.slice(100, 200), total))
      .mockResolvedValueOnce(page(all.slice(200, 250), total));

    const result = await openAdminCaseTranscript('case_a1b2c3d4e5f6');

    expect(mockRequest).toHaveBeenCalledTimes(3);
    expect(result.messages.messages).toHaveLength(total);
    expect(result.messages.messages[0].message_id).toBe('m0');
    expect(result.messages.messages[total - 1].message_id).toBe('m249');
    // Nothing is left for a caller to fetch, so `has_more` must not claim there is.
    expect(result.messages.has_more).toBe(false);
    expect(result.messages.retrieved_count).toBe(total);
  });

  it('requests the backend page cap, never the default', async () => {
    mockRequest.mockResolvedValueOnce(page([msg(0)], 1));

    await openAdminCaseTranscript('case_a1b2c3d4e5f6');

    const url = mockRequest.mock.calls[0][0] as string;
    expect(url).toContain('limit=100');
    expect(url).toContain('offset=0');
  });

  it('preserves the access envelope from the first page', async () => {
    mockRequest.mockResolvedValueOnce(page([msg(0)], 1));

    const result = await openAdminCaseTranscript('case_a1b2c3d4e5f6');

    expect(result.access).toBe('break_glass');
    expect(result.grant?.grant_id).toBe('grant-1');
  });

  it('stops on a short page even when total_count is overstated', async () => {
    // Guards the loop: a stale or wrong `total_count` must not spin forever.
    mockRequest.mockResolvedValue(page([msg(0), msg(1)], 9999));

    const result = await openAdminCaseTranscript('case_a1b2c3d4e5f6');

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(result.messages.messages).toHaveLength(2);
  });

  it('makes a single request for a short transcript', async () => {
    mockRequest.mockResolvedValueOnce(page([msg(0), msg(1)], 2));

    await openAdminCaseTranscript('case_a1b2c3d4e5f6');

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});
