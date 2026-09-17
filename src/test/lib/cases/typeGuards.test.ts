import { describe, it, expect } from 'vitest';

/**
 * Every `Omit`-based narrowing in `types/cases.ts` carries a derived guard.
 *
 * ‼ `Omit<Wire, 'cases'> & { cases: Narrowed[] }` IS BLIND TO THE RENAME IT
 * LOOKS LIKE IT CATCHES. `Omit`'s key parameter is `keyof any`, so when the
 * wire type no longer has `cases` it omits nothing, and the intersection puts
 * the field back. Measured on this file: renaming `CaseListResponse.cases` in
 * `api.generated.ts` produced ZERO errors — `listCases` would have read
 * `.cases` as `undefined` and rendered an empty case list with `tsc`,
 * `api-types-drift` and the whole suite green.
 *
 * The guards themselves are type-level and live in `src/types/cases.ts`, not
 * here: `tsconfig.json` excludes `src/test/**` and CI's only typecheck runs
 * against it, so an assertion in a test file is evaluated by nothing. What
 * this file holds is the shape of them — that they exist, that they DERIVE
 * their keys, and that they are stated as constraints.
 */

const raw = (await import('../../../types/cases.ts?raw')).default as unknown as string;

/**
 * Line comments stripped BEFORE block comments — the other order lets a
 * `// … /* …` comment start a block match that runs to the next `*\/`, deleting
 * real declarations. The `[^:]` guard keeps a `https://` from eating its line.
 */
const source = raw
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('case types guard their narrowings', () => {
  it('reads the source at all, with both comment kinds stripped', () => {
    expect(raw.length).toBeGreaterThan(1_000);
    expect(source.length).toBeGreaterThan(400);
    expect(source).toContain('CaseListResponse');
    expect(source.length).toBeLessThan(raw.length);
    // One phrase from a `//` comment and one from a `/** */` block, so a
    // half-working strip cannot pass unnoticed.
    expect(source).not.toContain('written out per type');
    expect(source).not.toContain('narrows the generated');
  });

  it('guards each Omit with a DERIVED Pick, never a restated key list', () => {
    const omits = source.match(/Omit<\s*\n?\s*components\['schemas'\]/g) ?? [];
    const derived = source.match(/Pick<\s*\n?\s*components\['schemas'\]\['[A-Za-z]+'\],\s*\n?\s*keyof\s+[A-Za-z]+\s*\n?\s*>/g) ?? [];
    expect(omits.length).toBeGreaterThan(0);
    expect(derived.length).toBeGreaterThanOrEqual(omits.length);
    // A hand-written key list is a second thing to keep in step, and the day
    // someone overrides another key and forgets it, the guard stops covering
    // it — the same blindness one level up.
    expect(source).not.toMatch(/Pick<\s*components\['schemas'\]\['[A-Za-z]+'\],\s*'/);
  });

  it('states the checks as constraints, not bare conditionals', () => {
    // A conditional type resolving to `never` is not an error — it is just
    // `never`, and the build stays green. Only `T extends true` rejects it.
    expect(source).toMatch(/type\s+_Assert<\s*T\s+extends\s+true\s*>/);
    expect(source).not.toMatch(/\?\s*true\s*:\s*never/);
  });

  it('guards the `& { source }` narrowings through an indexed access', () => {
    // `_IsSubtype<Wire & { source }, Wire>` is a TAUTOLOGY — an intersection is
    // always assignable to its parts, including when the wire drops `source`
    // and the `&` half goes on promising it. `Wire['source']` stops compiling
    // instead.
    for (const schema of ['CaseSummary', 'CaseDetail', 'AdminCaseMetadata']) {
      expect(source).toContain(`components['schemas']['${schema}']['source']`);
    }
  });
});
