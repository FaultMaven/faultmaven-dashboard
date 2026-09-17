import { describe, it, expect } from 'vitest';

/**
 * ONE subject for every contract guard in the app (#174).
 *
 * This replaces the per-file source checks that grew alongside #171–#173. The
 * guards themselves are type-level and live in app files — `tsconfig.json`
 * excludes `src/test/**` and CI's only typecheck runs against it, so an
 * assertion written here is evaluated by nothing. What this file holds is the
 * SHAPE of them: that every narrowing has one, that the guard names the right
 * pair, and that the helpers are still spelled the way they have to be spelled.
 *
 * ‼ THE SPLIT ITSELF WAS THE DEFECT. `_Assert` was declared in three files and
 * `_IsSubtype` in three, and the copies diverged inside a single pair of PRs:
 * `cases.ts` shipped the keys check without the subtype check on four of five
 * narrowings, and `functions.ts` shipped a bespoke `[number]` refinement in its
 * place. Both compiled clean against a mutated contract. Meanwhile the source
 * test covered `types/cases.ts` only, so neither hole was visible here.
 */

/**
 * ‼ THE FILES ARE DISCOVERED, NOT LISTED. A hand-written list bounds the sweep
 * to the files someone remembered, which is the same blindness one level up —
 * and it is the specific blindness #174 was: three per-file tests, each unable
 * to see the other two files, while the copies between them diverged. Measured
 * on the hand-list version of this file: a new `Omit<Wire, K> & { K: N }`
 * narrowing in an unlisted module, with no guard at all, kept all seven tests
 * green and `tsc` clean.
 *
 * `api.generated.ts` is excluded because it IS the contract — it is the thing
 * narrowings are checked against, not one of them.
 */
const modules = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const sources: Record<string, string> = Object.fromEntries(
  Object.entries(modules)
    .map(([path, raw]) => [path.replace(/^\//, ''), raw])
    .filter(
      ([path]) =>
        !path.startsWith('src/test/') && path !== 'src/types/api.generated.ts'
    )
);

/**
 * LINE comments stripped FIRST. The other order lets a `// … /* …` comment
 * start a block match that runs to the next `*\/`, deleting real declarations
 * and making every `not.toMatch` below pass against a hole. The `[^:]` guard
 * keeps a `https://` from eating its line.
 *
 * Stripping matters more here than usual: the prose in these files NAMES the
 * very identifiers being asserted on, so matching raw text would pass on
 * documentation alone.
 */
const strip = (raw: string) =>
  raw.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');

const stripped: Record<string, string> = Object.fromEntries(
  Object.entries(sources).map(([f, raw]) => [f, strip(raw)])
);

const HELPERS = 'src/types/contractGuards.ts';

/** Every app file that names a contract schema — the helper module aside. */
const guarded = Object.entries(stripped).filter(
  ([f, src]) => f !== HELPERS && src.includes("components['schemas']")
);

describe('contract guards: the sources are readable', () => {
  it('discovers the guarded files rather than listing them', () => {
    // The sweep is only as good as what it sweeps. If the glob silently stops
    // resolving, every `for` loop below iterates nothing and passes.
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    for (const f of ['src/types/llm.ts', 'src/types/cases.ts', 'src/lib/auth/functions.ts']) {
      expect(Object.keys(sources), `${f} not discovered`).toContain(f);
    }
    expect(Object.keys(sources)).not.toContain('src/types/api.generated.ts');
    expect(guarded.length).toBeGreaterThanOrEqual(4);
  });

  it('strips BOTH comment kinds', () => {
    // ‼ One probe per KIND, each from a file where that kind is the only place
    // the phrase occurs. Two block-comment probes look like coverage and are
    // not: measured — with two, deleting the line-comment stripper entirely
    // left all seven tests green.
    //
    // `//` only — llm.ts states this in line comments under its guard header.
    expect(stripped['src/types/llm.ts']).not.toContain('One `GuardNarrowing` per narrowing');
    // `/** */` only — cases.ts states this in a JSDoc block on each `source`.
    expect(stripped['src/types/cases.ts']).not.toContain('narrows the generated');
    // And the strip did not eat the declarations it was meant to leave.
    expect(stripped['src/types/cases.ts']).toContain('CaseListResponse');
    expect(stripped['src/types/llm.ts']).toContain('GuardNarrowing<');
  });
});

describe('every narrowing is guarded, and the list is DERIVED', () => {
  // ‼ The narrowings are found BY READING THE SOURCE, never restated here. A
  // hand-written list is a second list to keep in step — the exact blindness
  // these guards exist to remove, one level up. It also cannot see a narrowing
  // added to a file nobody remembered to add to the list, which is how
  // `llm.ts` and `functions.ts` ended up with no source coverage at all.

  it('pairs every `Omit<Wire, K> & { K: N }` narrowing with a GuardNarrowing', () => {
    let found = 0;
    for (const [file, src] of guarded) {
      const narrowings = src.matchAll(
        /(?:export )?type (\w+) = Omit<\s*components\['schemas'\]\['(\w+)'\],/g
      );
      for (const [, local, wire] of narrowings) {
        found += 1;
        expect(
          src,
          `${file}: ${local} narrows ${wire} but has no GuardNarrowing`
        ).toMatch(
          new RegExp(`GuardNarrowing<\\s*components\\['schemas'\\]\\['${wire}'\\],\\s*${local}\\s*>`)
        );
      }
    }
    // A regex that silently stops matching would make this vacuously true.
    expect(found).toBeGreaterThanOrEqual(10);
  });

  it('pairs every `Wire & { k?: N }` member narrowing with a GuardNarrowedMember', () => {
    // A DIFFERENT guard, because the whole-shape one degenerates to a tautology
    // here: an intersection is always assignable to its own parts.
    //
    // ‼ EVERY member of the body, not the first one. Anchoring on the
    // declaration head matches once per `type`, so `Wire & { a?: A; b?: B }`
    // yielded only `a` and `b` was required to have no guard at all. Every
    // member narrowing in the tree is single-keyed today, which is exactly why
    // that read correctly.
    //
    // ‼ And `\??:`, not `\?:`. All three are optional today, so demanding the
    // `?` matched all three and looked right — while a REQUIRED one
    // (`& { kind: SomeUnion }`) stayed invisible, guarded by nothing.
    let found = 0;
    for (const [file, src] of guarded) {
      const decls = src.matchAll(
        /(?:export )?type (\w+) = components\['schemas'\]\['(\w+)'\] & \{([\s\S]*?)\n\};/g
      );
      for (const [, local, wire, body] of decls) {
        const keys = [...body.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);
        expect(keys.length, `${file}: ${local} narrows nothing?`).toBeGreaterThan(0);
        for (const key of keys) {
          found += 1;
          expect(
            src,
            `${file}: ${local} narrows ${wire}.${key} but has no GuardNarrowedMember`
          ).toMatch(
            new RegExp(
              `GuardNarrowedMember<\\s*components\\['schemas'\\]\\['${wire}'\\],\\s*'${key}',`
            )
          );
        }
      }
    }
    expect(found).toBeGreaterThanOrEqual(3);
  });
});

describe('the helpers are declared ONCE, as constraints', () => {
  it('no file re-declares a guard primitive', () => {
    // THE #174 FIX, asserted directly. Three copies of `_Assert` and three of
    // `_IsSubtype` diverged and produced two measured holes. A local copy is
    // also how the bespoke `[number]` refinement got in: the primitive was to
    // hand, so it was reached for instead of the pairing.
    // Over EVERY app file, not a list — a fresh copy in a sixth module is
    // exactly the regression this test exists to prevent.
    for (const [file, src] of Object.entries(stripped)) {
      for (const prim of ['_Assert', '_IsSubtype', '_NotNullable']) {
        expect(src, `${file} re-declares ${prim}`).not.toMatch(
          new RegExp(`type\\s+${prim}\\s*<`)
        );
      }
    }
  });

  it('exports no loose primitive to reach for instead of the pairing', () => {
    // The helpers apply their whole pairing as ONE type, so a narrowing gets
    // both checks or neither. Exporting `_IsSubtype` beside them would put the
    // half-guarded form back within reach, which is all it takes.
    const helpers = stripped[HELPERS];
    const exported = [...helpers.matchAll(/export type (\w+)/g)].map((m) => m[1]);
    expect(exported.sort()).toEqual(['GuardNarrowedMember', 'GuardNarrowing', 'GuardSubset']);
  });

  it('states both checks as TYPE-PARAMETER constraints, not in the body', () => {
    // ‼ Measured on TypeScript 5.8: every in-body form fails at the
    // DECLARATION site, before it guards anything —
    //   `Pick<Wire, keyof Narrowed>`   `keyof Narrowed` widens to
    //                                  `string | number | symbol` in a generic
    //   `_Assert<KeysExist<W, N>>`     a deferred conditional's constraint is
    //                                  `boolean`, not `true`
    //   `_K extends keyof W = keyof N` a default is checked eagerly
    // A constraint on the parameter is deferred to the INSTANTIATION, which is
    // where the concrete types are known. That is the whole reason these work,
    // and it is why `llm.ts` and `cases.ts` both used to carry a comment saying
    // a generic helper was impossible.
    const helpers = stripped[HELPERS];
    expect(helpers).toMatch(
      /Narrowed extends Wire & Record<Exclude<keyof Narrowed, keyof Wire>, never>/
    );
    expect(helpers).toMatch(/Key extends keyof Wire/);
    expect(helpers).toMatch(/Narrowed extends Wire\[Key\] & \(null extends Wire\[Key\] \? never : unknown\)/);
    // No guard may hand-restate a key list, in any file.
    for (const [file, src] of Object.entries(stripped)) {
      expect(src, file).not.toMatch(/Pick<\s*components\['schemas'\]\['\w+'\],\s*'/);
    }
  });

  it('never resolves a check to `never`, and never strips nullability', () => {
    for (const [file, src] of Object.entries(stripped)) {
      // ‼ A conditional type that resolves to `never` IS NOT AN ERROR — it is
      // just `never`, and the build stays green. `lib/knowledge/types.ts`
      // carried exactly that form, so its bidirectional "is the contract shape"
      // check was inert. Only a constraint rejects.
      expect(src, `${file} has an inert \`? true : never\` guard`).not.toMatch(
        /\?\s*true\s*\n?\s*:\s*never/
      );
      // ‼ `NonNullable<Wire[K]>` erases exactly the change the `& { k?: N }`
      // narrowing cannot survive: the intersection annihilates the `null`, so
      // consumers are told `source` is always one of three literals while rows
      // arrive `null`. Measured — with `NonNullable` the change compiled clean.
      expect(src, file).not.toMatch(/NonNullable<\s*components\['schemas'\]\['\w+'\]\['\w+'\]/);
      expect(src, file).not.toMatch(/NonNullable<\s*Wire\[Key\]/);
    }
  });
});
