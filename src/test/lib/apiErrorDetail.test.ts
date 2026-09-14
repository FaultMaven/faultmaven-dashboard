import { describe, it, expect } from 'vitest';
import { handleAPIResponse } from '../../lib/knowledge/errors';

/**
 * `detail` is not always a string, and treating it as one put `[object Object]`
 * in front of users.
 *
 * The creation-date range made a structured 422 reachable from an ordinary
 * gesture — swap the ends of the range — and the banner beside the case list
 * read exactly `[object Object]`. Verified against the real body before the
 * fix. Three shapes arrive here and only the first was handled.
 */
function refusal(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    statusText: '',
    json: async () => body,
  } as unknown as Response;
}

async function messageFrom(response: Response): Promise<string> {
  try {
    await handleAPIResponse(response, 'fallback message');
    throw new Error('expected handleAPIResponse to throw');
  } catch (err) {
    return (err as Error).message;
  }
}

describe('the message a refusal puts in front of a user', () => {
  it('reads the backend ErrorResponse shape, not its [object Object]', async () => {
    // Exactly what `HTTPException(422, detail=ErrorResponse(...).model_dump())`
    // sends — the inverted-window refusal the date range can now produce.
    const body = {
      detail: {
        schema_version: '3.1.0',
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'created_after must not be later than created_before '
            + '(the window is [created_after, created_before))',
        },
      },
    };

    const message = await messageFrom(refusal(422, body));

    expect(message).toContain('created_after must not be later than created_before');
    expect(message).not.toContain('[object Object]');
  });

  it("reads FastAPI's own validation array", async () => {
    // What an unparseable `created_after` produces before the route is reached.
    const body = {
      detail: [
        { loc: ['query', 'created_after'], msg: 'Input should be a valid datetime', type: 'datetime_parsing' },
      ],
    };

    const message = await messageFrom(refusal(422, body));

    expect(message).toBe('Input should be a valid datetime');
    // `loc` is wire vocabulary, not something to show a user.
    expect(message).not.toContain('query');
  });

  it('still passes a plain string straight through', async () => {
    const message = await messageFrom(refusal(403, { detail: 'Not your case.' }));
    expect(message).toBe('Not your case.');
  });

  it('falls back rather than inventing a sentence from an unreadable body', async () => {
    // An empty object carries nothing to say; the caller's own default must win
    // instead of a placeholder that looks like it came from the server.
    expect(await messageFrom(refusal(500, { detail: {} }))).toBe('fallback message');
    expect(await messageFrom(refusal(500, {}))).toBe('fallback message');
  });

  it('never lets a raw object reach the message', async () => {
    // The property, across every shape above: whatever comes out is a sentence.
    for (const body of [
      { detail: { error: { message: 'a' } } },
      { detail: [{ msg: 'b' }] },
      { detail: 'c' },
      { detail: {} },
      { detail: [] },
      { detail: null },
    ]) {
      expect(await messageFrom(refusal(422, body))).not.toContain('[object Object]');
    }
  });
});
