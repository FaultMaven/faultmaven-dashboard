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

  it('pairs BOTH guards with every narrowing, by name', () => {
    // ‼ Assert the PAIRS, not a count. `derived.length >= omits.length` cannot
    // see the two edits most likely to break this: a narrowing spelled through
    // an intermediate alias (which the `Omit<components[...]` regex does not
    // match at all), and a guard whose `keyof` operand was copy-pasted from a
    // sibling. `AdminCaseListResponse` and `AdminCaseMetadataListResponse` have
    // byte-identical key sets, so the wrong operand compiles, matches the
    // regex, and keeps the count balanced while guarding nothing.
    const narrowings: [string, string][] = [
      ['CaseListResponse', 'CaseListResponse'],
      ['AdminCaseFullListResponse', 'AdminCaseListResponse'],
      ['AdminCaseMetadataListResponse', 'AdminCaseMetadataListResponse'],
      ['AdminCaseContentResponse', 'AdminCaseContentResponse'],
      ['AdminCaseMessagesResponse', 'AdminCaseMessagesResponse'],
    ];
    for (const [local, wire] of narrowings) {
      // keys guard: the wire schema and the local alias, tied together.
      expect(source).toMatch(
        new RegExp(`Pick<\\s*components\\['schemas'\\]\\['${wire}'\\],\\s*keyof ${local}\\s*>`)
      );
      // subtype guard: same pair, and wrapped in `_Assert`.
      expect(source).toMatch(
        new RegExp(`_Assert<\\s*_IsSubtype<\\s*${local},\\s*components\\['schemas'\\]\\['${wire}'\\]\\s*>\\s*>`)
      );
    }
    // No guard may hand-restate a key list.
    expect(source).not.toMatch(/Pick<\s*components\['schemas'\]\['[A-Za-z]+'\],\s*'/);
  });

  it('wraps EVERY guard member in _Assert, not just declares it', () => {
    // Declaring `_Assert` somewhere proves nothing about its use: drop the
    // wrapper from one member and it resolves to the type `false`, which is
    // not an error — the guard goes inert while every other assertion here
    // stays green. That is the same "a conditional is not an error" defect the
    // guards themselves exist to avoid.
    expect(source).toMatch(/type\s+_Assert<\s*T\s+extends\s+true\s*>/);
    const members = source.match(/^\s*[a-zA-Z]+(?:Subtype|Source|SourceNotNull):\s*[^;]+;/gm) ?? [];
    expect(members.length).toBeGreaterThanOrEqual(9);
    for (const m of members) {
      expect(m.replace(/^\s*[a-zA-Z]+:\s*/, '')).toMatch(/^_Assert</);
    }
  });

  it('does not strip nullability out of the `source` comparison', () => {
    // `NonNullable<Wire['source']>` erases exactly the change the
    // `& { source?: CaseSource }` narrowing cannot survive — the intersection
    // annihilates `null`, so consumers are told `source` is always one of three
    // literals while rows arrive `null`. Measured: with `NonNullable` the
    // nullability change compiled clean.
    expect(source).not.toMatch(/NonNullable<\s*components\['schemas'\]\['[A-Za-z]+'\]\['source'\]/);
    for (const schema of ['CaseSummary', 'CaseDetail', 'AdminCaseMetadata']) {
      expect(source).toContain(`_NotNullable<components['schemas']['${schema}']['source']>`);
    }
  });
});
