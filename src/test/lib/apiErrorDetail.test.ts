import { describe, it, expect } from 'vitest';
import { handleAPIResponse } from '../../lib/knowledge/errors';

/**
 * THE BODIES BELOW WERE CAPTURED FROM THE SERVER, not imagined.
 *
 * The first version of this file asserted two shapes this API does not send —
 * a nested `ErrorResponse` envelope and a bare FastAPI validation array — and
 * the commit claimed they had been measured. They had not. A body was
 * reconstructed in Node from an assumption and the assumption was tested
 * against itself, so four tests passed against fiction while the real gap
 * stayed open.
 *
 * These are the real ones, produced by an app registering what `main.py`
 * registers. The trap worth recording: `get_exception_handlers()` returns only
 * the DOMAIN handlers, so an app built from it alone sees raw FastAPI output —
 * a dict `detail` and an array `detail` — and neither is what production sends.
 */
const INVERTED_WINDOW = {
  detail:
    'created_after must not be later than created_before '
    + '(the window is [created_after, created_before))',
};

const UNPARSEABLE_DATETIME = {
  detail: 'Validation error',
  errors: [
    {
      type: 'datetime_from_date_parsing',
      loc: ['query', 'created_after'],
      msg: 'Input should be a valid datetime or date, invalid character in year',
      input: 'last Tuesday',
      ctx: { error: 'invalid character in year' },
    },
  ],
};

function refusal(status: number, body: unknown): Response {
  return { ok: false, status, statusText: '', json: async () => body } as unknown as Response;
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
  it('shows the sentence an inverted date window comes back with', async () => {
    const message = await messageFrom(refusal(422, INVERTED_WINDOW));
    expect(message).toContain('created_after must not be later than created_before');
  });

  it('names the offending parameter on an unparseable date, not just "Validation error"', async () => {
    // THE REAL GAP. `detail` is the constant "Validation error" and every
    // useful word is in `errors`, which nothing read — so a mistyped date
    // produced a banner saying "Validation error" and nothing else.
    const message = await messageFrom(refusal(422, UNPARSEABLE_DATETIME));

    expect(message).toContain('Input should be a valid datetime');
    expect(message).not.toBe('Validation error');
  });

  it('still passes an ordinary string detail straight through', async () => {
    expect(await messageFrom(refusal(403, { detail: 'Not your case.' }))).toBe('Not your case.');
  });

  it('falls back rather than inventing a sentence from an unreadable body', async () => {
    expect(await messageFrom(refusal(500, { detail: {} }))).toBe('fallback message');
    expect(await messageFrom(refusal(500, {}))).toBe('fallback message');
    expect(await messageFrom(refusal(500, { detail: 'Validation error', errors: [] }))).toBe(
      'Validation error',
    );
  });

  it('never lets a raw object reach the message, whatever arrives', async () => {
    // A guard, not a claim about what this API sends: no body should ever be
    // able to render as `[object Object]`, including one from a path that
    // bypasses the handlers `main.py` registers.
    for (const body of [
      { detail: { error: { message: 'a' } } },
      { detail: [{ msg: 'b' }] },
      { detail: { nested: { deeper: true } } },
      { detail: [] },
      { detail: null },
      INVERTED_WINDOW,
      UNPARSEABLE_DATETIME,
    ]) {
      expect(await messageFrom(refusal(422, body))).not.toContain('[object Object]');
    }
  });
});
