import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * What the manual-create request actually sends.
 *
 * `difficulty` is the ONE select the backend defaults, so "not specified" is a
 * real answer — but only if the field is OMITTED. Sending `''` is an invalid
 * value the server rejects, which would turn a deliberate non-answer into a
 * 422 and defeat the point of letting it be unset.
 */
vi.mock('./../../lib/knowledge/client', () => ({
  makeAuthenticatedRequest: vi.fn(),
  buildQueryParams: vi.fn(),
}));

import { createRunbookManually } from '../../lib/knowledge/conversion';
import { makeAuthenticatedRequest } from '../../lib/knowledge/client';

const base = {
  title: 'A sufficiently long runbook title',
  domain: 'database',
  service: 'postgresql',
  symptom_class: ['connection_refused'],
  severity: 'high',
  scope: 'personal',
  tags: [],
  symptom_recognition: 'x'.repeat(20),
  applicability: 'x'.repeat(20),
  diagnostic_steps: 'x'.repeat(20),
  causes: '### Cause A: Something\n**Statement:** It broke.',
  prevention: 'x'.repeat(20),
};

function sentBody(): Record<string, unknown> {
  const call = vi.mocked(makeAuthenticatedRequest).mock.calls[0];
  return JSON.parse((call[1] as RequestInit).body as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(makeAuthenticatedRequest).mockResolvedValue(
    new Response('{"conversion_id":"c1","draft":{}}', { status: 201 }),
  );
});

describe('difficulty', () => {
  it('is OMITTED when the author left it unspecified', async () => {
    await createRunbookManually({ ...base, difficulty: '' });

    expect(sentBody()).not.toHaveProperty('difficulty');
  });

  it('is sent when the author chose one', async () => {
    await createRunbookManually({ ...base, difficulty: 'advanced' });

    expect(sentBody().difficulty).toBe('advanced');
  });

  it('never sends an empty string, which the backend rejects', async () => {
    await createRunbookManually({ ...base, difficulty: '' });

    expect(Object.values(sentBody())).not.toContain('');
  });
});
