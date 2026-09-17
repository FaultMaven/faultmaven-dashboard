import { describe, it, expect } from 'vitest';

import { stripComments } from '../support/stripComments';

/**
 * The `/auth/config` parse must stay bound to the GENERATED contract types.
 *
 * #163 existed because it was not: `fetchAuthConfigOnce` declared its own
 * inline type literal, so this app read `supports_screen_hint` while pinning
 * a contract that had never heard of it, and `api-types-drift` stayed green
 * because it only diffs the generated file — which that module never touched.
 *
 * The runtime tests cannot see this. They feed `fetchAuthConfigOnce` plain
 * object literals, so they pass identically whether the parse is derived from
 * `components['schemas']` or hand-written — which is exactly why the inline
 * literal survived as long as it did.
 *
 * So this is a SOURCE assertion, in the spirit of `errors/error-body.test.ts`
 * ("fails if a new one appears"). It is deliberately about the shape of the
 * code rather than its behaviour, because the property being protected is
 * "the compiler will notice", and no amount of mocked I/O demonstrates that.
 *
 * ‼ The binding was already incomplete once in exactly the place nothing
 * tested: `Omit<T, 'oauth'>` legally no-ops when the key is gone, so renaming
 * the container upstream compiled clean and left `authConfig.oauth`
 * undefined for every cloud deployment — sign-in answering "not configured"
 * with the whole suite green. Hence the indexed-access assertion below.
 */
const raw: string = (
  await import('../../context/AuthContext.tsx?raw')
).default as unknown as string;

/**
 * The source with COMMENTS REMOVED.
 *
 * Asserting on the raw file is how this test was vacuous on its first run:
 * the comment explaining the indexed access mentions
 * `AuthConfigSchema['oauth']`, so reverting the actual type to the broken
 * `Omit + named schema` form still matched and still passed. A source test
 * that prose can satisfy proves nothing about the code.
 */
const source = stripComments(raw);

describe('the /auth/config parse is bound to the contract', () => {
  it('reads the source at all, with comments stripped', () => {
    // Fail closed twice over: an empty or renamed module, or a strip that ate
    // the whole file, would make every assertion below vacuously true.
    expect(raw.length).toBeGreaterThan(1_000);
    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain('fetchAuthConfigOnce');
    // The strip must actually remove prose, or these assertions are back to
    // matching comments.
    expect(source.length).toBeLessThan(raw.length);
    expect(source).not.toContain('LOCAL MODE ACTIVE');
  });

  it('derives the wire type from the generated schema', () => {
    expect(source).toContain("components['schemas']['AuthConfigResponse']");
  });

  it('binds the `oauth` container by INDEXED ACCESS, not by naming its schema', () => {
    // `Omit<…, 'oauth'> & { oauth?: Partial<OAuthConfigResponse> }` type-checks
    // even after the key is renamed away, because the intersection supplies it
    // back. Indexing through the parent is what makes the key load-bearing.
    expect(source).toMatch(/AuthConfigSchema\['oauth'\]/);
  });

  it('does not re-introduce a hand-written literal for the response body', () => {
    // The shape #163 was filed about: `const authConfig: { auth_mode?: ... }`.
    const inlineAnnotated = /const\s+authConfig\s*:\s*\{/.test(source);
    expect(
      inlineAnnotated,
      'authConfig is annotated with an inline object literal again — derive it from components[\'schemas\'] instead (#163)'
    ).toBe(false);
  });

  it('does not silence the binding with `any`', () => {
    // An `as any` on the parse restores the blind spot without deleting a
    // single line this file greps for.
    expect(source).not.toMatch(/await\s+res\.json\(\)\s+as\s+any/);
    expect(source).not.toMatch(/authConfig\s*:\s*any/);
  });
});
