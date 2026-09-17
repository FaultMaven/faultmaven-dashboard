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
const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('llm types are sourced from the generated contract', () => {
  it('reads the source at all, with comments stripped', () => {
    expect(raw.length).toBeGreaterThan(1_000);
    expect(source.length).toBeGreaterThan(400);
    expect(source).toContain('LLMConfig');
    expect(source.length).toBeLessThan(raw.length);
    expect(source).not.toContain('Bind the names');
  });

  it('binds every response and request shape to a schema', () => {
    for (const schema of [
      'LLMProviderDetail',
      'LLMConfigResponse',
      'LLMConfigUpdateRequest',
      'LLMConfigUpdateResponse',
      'LLMConnectionTestResponse',
      'EnvConfigStatusResponse',
      'FeatureStatus',
    ]) {
      expect(source).toContain(`components['schemas']['${schema}']`);
    }
  });

  it('declares no hand-written twin of a bound shape', () => {
    for (const name of ['LLMProvider', 'LLMConfig', 'EnvConfigStatus', 'FeatureStatus']) {
      expect(source).not.toMatch(new RegExp(`interface\\s+${name}\\b`));
      expect(source).not.toMatch(new RegExp(`type\\s+${name}\\s*=\\s*\\{`));
    }
  });

  it('guards every narrowed key with Pick, not Omit alone', () => {
    const omits = source.match(/Omit<\s*components\['schemas'\]/g) ?? [];
    const picks = source.match(/Pick<\s*components\['schemas'\]/g) ?? [];
    expect(omits.length).toBeGreaterThan(0);
    expect(picks.length).toBeGreaterThanOrEqual(omits.length);
  });
});
