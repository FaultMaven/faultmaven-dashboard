import { describe, it, expect, vi } from 'vitest';

/**
 * `translateConversionError` is what turns a backend `error_code` into the copy
 * a user reads, and it had no coverage in any arm.
 *
 * That gap is how the copy this suite now pins went stale in the first place:
 * `ALREADY_A_RUNBOOK` shipped its entry, its 422 and its enum member long before
 * anything raised it (FaultMaven/faultmaven#1375), so nobody ever read the
 * sentence, and it sat pointing at an operator-only menu item until the refusal
 * went live.
 */

vi.mock('./../../lib/knowledge/client', () => ({
  makeAuthenticatedRequest: vi.fn(),
  buildQueryParams: vi.fn(),
}));

import { translateConversionError } from '../../lib/knowledge/conversion';

const FALLBACK = 'Conversion failed for an unknown reason.';

describe('translateConversionError', () => {
  it('translates a known error code', () => {
    const info = translateConversionError({ error_code: 'ALREADY_A_RUNBOOK' }, FALLBACK);

    expect(info.title).toBe('Already a runbook');
    expect(info.code).toBe('ALREADY_A_RUNBOOK');
    expect(info.action).toBeTruthy();
  });

  it('falls back to detail for an unknown code', () => {
    const info = translateConversionError(
      { error_code: 'SOMETHING_NEW', detail: 'The server said something specific.' },
      FALLBACK,
    );

    expect(info.message).toBe('The server said something specific.');
    expect(info.code).toBeUndefined();
  });

  it('falls back to the supplied message when there is no detail', () => {
    expect(translateConversionError(null, FALLBACK).message).toBe(FALLBACK);
  });

  it('does not treat an inherited Object.prototype key as a known code', () => {
    // `'toString' in ERROR_TRANSLATIONS` is true for a plain object literal, so
    // an `in` guard hands back `Function.prototype.toString` typed as
    // ConversionErrorInfo through the index signature — the panel renders three
    // empty lines and the detail fallback, the branch carrying the real message,
    // never runs.
    for (const inherited of ['toString', 'constructor', 'valueOf', 'hasOwnProperty']) {
      const info = translateConversionError(
        { error_code: inherited, detail: 'The real message.' },
        FALLBACK,
      );

      expect(info.message).toBe('The real message.');
      expect(typeof info.title).toBe('string');
      expect(info.title).toBeTruthy();
    }
  });

  it('returns a copy, so a consumer cannot edit the shared table', () => {
    // KBPage puts this object straight into React state. Personalising a message
    // in place — the obvious way to make the copy role-aware — would otherwise
    // rewrite the entry for every later error in the session.
    const first = translateConversionError({ error_code: 'ALREADY_A_RUNBOOK' }, FALLBACK);
    first.action = 'MUTATED';

    const second = translateConversionError({ error_code: 'ALREADY_A_RUNBOOK' }, FALLBACK);
    expect(second.action).not.toBe('MUTATED');
  });
});

describe('ALREADY_A_RUNBOOK copy', () => {
  const info = () => translateConversionError({ error_code: 'ALREADY_A_RUNBOOK' }, FALLBACK);

  it('names no menu item', () => {
    // The failure this replaces: naming a control the reader cannot act on.
    // `Add Runbook` is operator-only AND global-only, and refused for every role
    // under TENANT_PROVIDER=multi, so it is a dead end in cloud even for an
    // operator; and NewDropdown is unmounted while this overlay is open, so any
    // label named is off-screen as it is read. The remedy is the button
    // ConvertUpload renders, not a noun in the sentence.
    const text = `${info().message} ${info().action}`;

    expect(text).not.toMatch(/Add Runbook/i);
    expect(text).not.toMatch(/Upload feature/i);
  });

  it('does not claim the source document loses its verification', () => {
    // Conversion never touches the source — the reset lands on the derived
    // draft. A bare "its" binds to the uploaded document and reads as a threat
    // to something the user owns.
    expect(info().message).toMatch(/the new one/);
  });
});
