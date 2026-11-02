import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * KB uploads and conversions carry the submission's Idempotency-Key, and the
 * keyed-retry refusals are read from `x-error-code` / `Retry-After`: core sends
 * their bodies as `{"detail"}` only (contract 14.11.0, FaultMaven/faultmaven#2433).
 */

vi.mock('../../../config', () => ({ default: { apiUrl: 'http://test-api.local' } }));
vi.mock('../../../lib/auth', () => ({
  authManager: { getAccessToken: vi.fn().mockResolvedValue('t'), refreshTokens: vi.fn() },
  AuthenticationError: class extends Error {},
}));

import { uploadDocument } from '../../../lib/knowledge/kb';
import { convertDocument, ConversionAPIError } from '../../../lib/knowledge/conversion';
import { APIError } from '../../../lib/knowledge/errors';

const fetchSpy = vi.fn();
const KEY = '0123456789abcdef0123456789abcdef';
const file = () => new File(['# rb'], 'redis.md', { type: 'text/markdown' });
const upload = () => uploadDocument({ file: file(), title: 'Redis', document_type: 'runbook', scope: 'personal' }, KEY);

function refusal(status: number, code: string, retryAfter?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-error-code': code };
  if (retryAfter !== undefined) headers['Retry-After'] = retryAfter;
  // A real reason phrase, as HTTP/1.1 sends: the code must come from x-error-code, not statusText.
  const statusText = ({ 409: 'Conflict', 500: 'Internal Server Error' } as Record<number, string>)[status];
  return new Response(JSON.stringify({ detail: 'Retry with the same Idempotency-Key.' }), { status, statusText, headers });
}

const sentKey = () => new Headers((fetchSpy.mock.calls[0][1] as RequestInit).headers).get('Idempotency-Key');

beforeEach(() => {
  fetchSpy.mockReset();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

describe('uploadDocument', () => {
  it('sends the Idempotency-Key it is given', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ document_id: 'd1' }), { status: 201 }));
    await upload();
    expect(sentKey()).toBe(KEY);
  });

  it('resolves a replayed 201 like the first', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ document_id: 'd1' }), { status: 201, headers: { 'X-Idempotency-Replayed': 'true' } }),
    );
    await expect(upload()).resolves.toEqual({ document_id: 'd1' });
  });

  it('reads the code and Retry-After off a 409 whose body has only detail', async () => {
    fetchSpy.mockResolvedValue(refusal(409, 'KB_REQUEST_IN_PROGRESS', '7'));
    const err = await upload().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(APIError);
    expect((err as APIError).errorCode).toBe('KB_REQUEST_IN_PROGRESS');
    expect((err as APIError).retryAfter).toBe(7);
  });

  it('reads the code off a 500 KB_INGEST_OUTCOME_UNKNOWN; no Retry-After is undefined', async () => {
    fetchSpy.mockResolvedValue(refusal(500, 'KB_INGEST_OUTCOME_UNKNOWN'));
    const err = (await upload().catch((e: unknown) => e)) as APIError;
    expect(err.errorCode).toBe('KB_INGEST_OUTCOME_UNKNOWN');
    expect(err.retryAfter).toBeUndefined();
  });

  it('treats an unparseable Retry-After as absent', async () => {
    fetchSpy.mockResolvedValue(refusal(409, 'KB_REQUEST_IN_PROGRESS', 'Wed, 21 Oct 2026 07:28:00 GMT'));
    expect(((await upload().catch((e: unknown) => e)) as APIError).retryAfter).toBeUndefined();
  });
});

describe('convertDocument', () => {
  it('sends the Idempotency-Key it is given; a 201 without X-Idempotency-Replayed is no replay', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ conversion_id: 'c1', drafts: [] }), { status: 201 }));
    await expect(convertDocument(file(), 'personal', KEY)).resolves.toEqual({
      conversion: { conversion_id: 'c1', drafts: [] },
      replayed: false,
    });
    expect(sentKey()).toBe(KEY);
  });

  it('reports a replay from X-Idempotency-Replayed', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ conversion_id: 'c1', drafts: [] }), { status: 201, headers: { 'X-Idempotency-Replayed': 'true' } }),
    );
    expect((await convertDocument(file(), 'personal', KEY)).replayed).toBe(true);
  });

  it('reads x-error-code and Retry-After into the translated error', async () => {
    fetchSpy.mockResolvedValue(refusal(409, 'KB_REQUEST_IN_PROGRESS', '1'));
    const err = (await convertDocument(file(), 'personal', KEY).catch((e: unknown) => e)) as ConversionAPIError;
    expect(err).toBeInstanceOf(ConversionAPIError);
    expect(err.errorCode).toBe('KB_REQUEST_IN_PROGRESS');
    expect(err.retryAfter).toBe(1);
    expect(err.errorInfo.message).toBe(
      'This conversion is still being processed. Try again in about 1 second from this tab, without changing it or reloading; it will not be published twice.',
    );
  });

  it('translates IDEMPOTENCY_REPLAY_UNAVAILABLE from the header, not the server detail', async () => {
    fetchSpy.mockResolvedValue(refusal(409, 'IDEMPOTENCY_REPLAY_UNAVAILABLE'));
    const err = (await convertDocument(file(), 'personal', KEY).catch((e: unknown) => e)) as ConversionAPIError;
    expect(err.errorInfo.message).toBe('This conversion already completed. Your drafts list is being reloaded.');
  });
});
