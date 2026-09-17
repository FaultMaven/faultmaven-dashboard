import { describe, it, expect } from 'vitest';

/**
 * LLM config types are BOUND to the pinned contract, not restated (#165).
 *
 * The type-level guards are NOT here — they are at the bottom of
 * `src/types/llm.ts`, because `tsconfig.json` excludes `src/test/**` and CI's
 * only typecheck (`pnpm typecheck`) runs against it. An assertion in a test
 * file is evaluated by nothing.
 *
 * The guards exist because `Omit` DOES NOT CATCH THE RENAME IT LOOKS LIKE IT
 * CATCHES. Its key parameter is `keyof any`, so `Omit<Wire, 'gone'>` omits
 * nothing and compiles clean, and the `& { gone: Narrowed }` half then puts
 * the field back — leaving a client reading a key the contract dropped, which
 * is the #165 defect wearing the costume of a fix. `Pick` constrains to
 * `keyof T` and fails the build. Measured both ways.
 *
 * What is left here is the SOURCE check: that the bindings are still spelled
 * the way they have to be spelled, and that no hand-written twin has crept
 * back beside them.
 */

const raw = (await import('../../../types/llm.ts?raw')).default as unknown as string;

/**
 * Comments stripped, with the `[^:]` guard so a `https://` cannot eat the rest
 * of its line. The prose above names the very identifiers being asserted on,
 * so matching the raw text would pass on documentation alone — the trap
 * `authConfigContractBinding.test.ts` records.
 */
const source = raw
  // LINE comments FIRST. The other order lets a `// … /* …` comment start a
  // block match that runs to the next `*/`, deleting real declarations from
  // `source` and making every `not.toMatch` below pass against a hole.
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('llm types are sourced from the generated contract', () => {
  it('reads the source at all, with comments stripped', () => {
    expect(raw.length).toBeGreaterThan(1_000);
    expect(source.length).toBeGreaterThan(400);
    expect(source).toContain('LLMConfig');
    expect(source.length).toBeLessThan(raw.length);
    // Prove BOTH strippers ran, with a phrase from each kind of comment — one
    // `//` line and one `/** */` block. Checking only a line comment leaves the
    // block stripper unproven, which is how a half-working strip goes unnoticed.
    expect(source).not.toContain('Bind the names');
    expect(source).not.toContain('never the declared');
  });

  it('binds every response and request shape to a schema', () => {
    // `LLMConfigUpdateResponse` is deliberately absent: `updateLLMConfig`
    // returns `Promise<void>` and nothing reads the body, so a type for it was
    // dead code kept alive only by this list. A test that pins an unused type
    // in place stops the next person from deleting it.
    for (const schema of [
      'LLMProviderDetail',
      'LLMConfigResponse',
      'LLMConfigUpdateRequest',
      'LLMConnectionTestResponse',
      'EnvConfigStatusResponse',
      'FeatureStatus',
    ]) {
      expect(source).toContain(`components['schemas']['${schema}']`);
    }
  });

  it('declares no hand-written twin of a bound shape', () => {
    // EVERY exported shape, not a sample. `\b` does not help here: `LLMConfig`
    // is followed by `U` in `LLMConfigUpdate`, so there is no word boundary and
    // listing only the short name leaves the UPDATE REQUEST — the likeliest
    // place to add a field by hand — completely uncovered.
    for (const name of [
      'LLMProvider',
      'LLMConfig',
      'LLMConfigUpdate',
      'ProviderConnectionTestResult',
      'EnvConfigStatus',
      'FeatureStatus',
    ]) {
      expect(source).not.toMatch(new RegExp(`interface\\s+${name}\\b`));
      expect(source).not.toMatch(new RegExp(`type\\s+${name}\\s*=\\s*\\{`));
    }
  });

  it('derives the guards\' keys instead of restating them', () => {
    // The invariant is "every narrowed key is guarded". Counting `Omit`s
    // against `Pick`s is a PROXY for it, and the proxy is wrong for exactly
    // the edit the guards exist to police: narrow a fifth key inside an
    // existing `Omit` list, forget to add it to a hand-written `Pick` list,
    // and the counts stay 4 and 4 while the new key is unguarded.
    //
    // `Pick<Wire, keyof Narrowed>` makes the invariant true BY CONSTRUCTION —
    // the key set cannot drift from the type it is taken from. So the thing to
    // assert is the form, not the arithmetic.
    const derived = source.match(/Pick<\s*components\['schemas'\]\['[A-Za-z]+'\],\s*keyof\s+[A-Za-z]+\s*>/g) ?? [];
    const omits = source.match(/Omit<\s*\n?\s*components\['schemas'\]/g) ?? [];
    expect(omits.length).toBeGreaterThan(0);
    expect(derived.length).toBeGreaterThanOrEqual(omits.length);
    // And no guard may hand-restate a key list.
    expect(source).not.toMatch(/Pick<\s*components\['schemas'\]\['[A-Za-z]+'\],\s*'/);
  });

  it('states the subtype checks as constraints, not bare conditionals', () => {
    // ‼ A conditional type that resolves to `never` IS NOT AN ERROR — it is
    // just `never`, and the build stays green. The first version of these
    // guards used `... ? true : never` and reported nothing when a narrowed
    // member's type changed underneath it, which is the entire failure they
    // exist to catch. Only a CONSTRAINT (`T extends true`) makes the compiler
    // reject it. Measured both ways.
    expect(source).toMatch(/type\s+_Assert<\s*T\s+extends\s+true\s*>/);
    expect(source).not.toMatch(/extends\s*\[Wire\]\s*\?\s*true\s*:\s*never/);
    // Every subtype guard goes through it.
    const subtypes = source.match(/Subtype:\s*_Assert<_IsSubtype</g) ?? [];
    expect(subtypes.length).toBeGreaterThanOrEqual(4);
  });
});
