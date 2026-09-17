import { describe, it, expect } from 'vitest';

import { stripComments } from '../support/stripComments';

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
 * an earlier `cases.ts` carried the keys check without the subtype check on
 * four of five narrowings, and an earlier `functions.ts` substituted a bespoke
 * `[number]` refinement for it. Both compiled clean against a mutated contract.
 * Meanwhile the source test covered `types/cases.ts` only, so neither hole was
 * visible here.
 */

/**
 * ‼ THE FILES ARE DISCOVERED, NOT LISTED. A hand-written list bounds the sweep
 * to the files someone remembered, which is the same blindness one level up —
 * and it is the specific blindness #174 was: three per-file tests, each unable
 * to see the other two files, while the copies between them diverged. Measured
 * on the hand-list draft of this file: a new `Omit<Wire, K> & { K: N }`
 * narrowing in an unlisted module, with no guard at all, kept every test green.
 *
 * ‼ THE EXCLUSIONS MIRROR `tsconfig.json`, which excludes `src/test/**` AND
 * co-located `.test.ts(x)` files. There are 11 of those under `src/lib`; with
 * only the first exclusion they are swept as app code, and a fixture narrowing
 * inside one would demand a `GuardNarrowing` be written INTO a test file —
 * where the constraint is evaluated by nothing. That is the exact trap this
 * whole module exists to warn about, enforced by the test.
 *
 * `api.generated.ts` is excluded because it IS the contract — the thing
 * narrowings are checked against, not one of them. Excluding in the glob rather
 * than after it also keeps 436 KB of generated source from being inlined into
 * this module on every run.
 */
const modules = import.meta.glob(
  [
    '/src/**/*.{ts,tsx}',
    '!/src/test/**',
    '!/src/**/*.test.{ts,tsx}',
    '!/src/types/api.generated.ts',
  ],
  { query: '?raw', import: 'default', eager: true }
) as Record<string, string>;

const sources: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([path, raw]) => [path.replace(/^\//, ''), raw])
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
const strip = stripComments;

const stripped: Record<string, string> = Object.fromEntries(
  Object.entries(sources).map(([f, raw]) => [f, strip(raw)])
);

const HELPERS = 'src/types/contractGuards.ts';

/** Every app file that names a contract schema — the helper module aside. */
const guarded = Object.entries(stripped).filter(
  ([f, src]) => f !== HELPERS && src.includes("components['schemas']")
);

/**
 * Local aliases of a schema, so the sweeps can see through them.
 *
 * ‼ A narrowing spelled through an intermediate alias is invisible to a regex
 * anchored on `components['schemas']`, and one exists in the tree
 * (`AuthConfigSchema` in `context/AuthContext.tsx`). The test this file
 * replaced documented that blindness and compensated with a hand-written pair
 * list; dropping the list without resolving aliases would have left the
 * acknowledged hole as the only mechanism.
 */
const aliasesOf = (src: string): Record<string, string> =>
  Object.fromEntries(
    [...src.matchAll(/(?:export )?type (\w+) = components\['schemas'\]\['(\w+)'\];/g)].map(
      (m) => [m[1], m[2]]
    )
  );

/** `components['schemas']['X']` or a local alias of it → the schema name. */
const schemaNamed = (ref: string, aliases: Record<string, string>): string | undefined =>
  ref.match(/components\['schemas'\]\['(\w+)'\]/)?.[1] ?? aliases[ref.trim()];

/**
 * The region of a file where a guard may legitimately appear: the `*Guards`
 * block, plus every `type X = …;` it references.
 *
 * ‼ The bans below are scoped to THIS, not to whole files. A component writing
 * `NonNullable<components['schemas']['CaseDetail']['stage']>` for a non-null
 * branch, or a read model spelled `Pick<components['schemas']['X'], 'title'>`
 * — the very shape `GuardSubset`'s own doc example uses — is ordinary code, and
 * a whole-file ban fails it with a message saying the file "has an inert
 * guard" when it has no guard at all.
 */
const guardRegion = (src: string): string => {
  const block = src.match(/export type \w*Guards = \{[\s\S]*?\n\};/)?.[0] ?? '';
  if (!block) return src.includes('GuardNarrowing<') ? src : '';
  // ‼ `(?:<[^>]*>)?` — the declaration may be GENERIC. Matching only
  // `type _X =` silently dropped `type _Inert<T> = …` from the region, and the
  // bans below then missed an inert guard sitting inside the block itself.
  // Measured: with the narrower regex, injecting `_Inert<T> = T extends true ?
  // true : never` into `CaseTypeGuards` passed.
  const referenced = [...block.matchAll(/\b(_\w+)\b/g)].map((m) => m[1]);
  const decls = referenced
    .map((n) => src.match(new RegExp(`type ${n}(?:<[^>]*>)? =[\\s\\S]*?;`))?.[0] ?? '')
    .join('\n');
  return `${decls}\n${block}`;
};

describe('contract guards: the sweep sees what it claims to', () => {
  it('discovers the guarded files rather than listing them', () => {
    // The sweep is only as good as what it sweeps. If the glob silently stops
    // resolving, every `for` loop below iterates nothing and passes.
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    for (const f of [HELPERS, 'src/types/llm.ts', 'src/types/cases.ts', 'src/lib/auth/functions.ts']) {
      expect(Object.keys(sources), `${f} not discovered`).toContain(f);
    }
    expect(guarded.length).toBeGreaterThanOrEqual(4);
  });

  it('excludes the contract itself and every file tsconfig excludes', () => {
    expect(Object.keys(sources)).not.toContain('src/types/api.generated.ts');
    const tests = Object.keys(sources).filter(
      (f) => f.startsWith('src/test/') || /\.test\.tsx?$/.test(f)
    );
    expect(tests).toEqual([]);
  });

  it('strips BOTH comment kinds', () => {
    // ‼ One probe per KIND, each from a file where that kind is the only place
    // the phrase occurs. Two block-comment probes look like coverage and are
    // not: measured — with two, deleting the line-comment stripper entirely
    // left every test green.
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
      const aliases = aliasesOf(src);
      // `Omit<` in HEAD position only. `Partial<Omit<Wire, K>> & { K: N }` is a
      // deliberately-DEFENSIVE parse type, not a narrowing — `AuthConfigWire`
      // weakens the contract on purpose because its reader "must not assume
      // conformance". Guarding it would assert the very thing it is checking.
      const narrowings = src.matchAll(
        /(?:export )?type (\w+) = Omit<\s*([\w'[\]]+(?:\['\w+'\])?),/g
      );
      for (const [, local, wireRef] of narrowings) {
        const wire = schemaNamed(wireRef, aliases);
        if (!wire) continue;
        found += 1;
        expect(src, `${file}: ${local} narrows ${wire} but has no GuardNarrowing`).toMatch(
          new RegExp(
            `GuardNarrowing<\\s*(?:components\\['schemas'\\]\\['${wire}'\\]|\\w+),\\s*${local}\\s*>`
          )
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
    // yielded only `a`, and `b` was required to have no guard at all. Every
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
        const members = [...body.matchAll(/^\s*(\w+)\??:\s*([^;]+);/gm)];
        expect(members.length, `${file}: ${local} narrows nothing?`).toBeGreaterThan(0);
        for (const [, key, declaredType] of members) {
          found += 1;
          // ‼ THE GUARD MUST NAME THE TYPE THE DECLARATION USES — checked HERE,
          // by reading both spellings, rather than by deriving the guard's
          // third argument from the alias.
          //
          // Deriving is the obvious fix and it is WRONG: `Local['key']` on a
          // `Wire & { key?: N }` alias is an INTERSECTION WITH THE WIRE, so a
          // wire retype flows into both sides of the comparison and cancels
          // out. Measured — the derived form compiles clean on exactly the
          // mutation the guard exists to catch. A test can compare two
          // spellings without creating that circularity; a type cannot.
          const t = declaredType.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          expect(
            src,
            `${file}: ${local} narrows ${wire}.${key} as ${declaredType.trim()} — ` +
              `GuardNarrowedMember must name that same type`
          ).toMatch(
            new RegExp(
              `GuardNarrowedMember<\\s*components\\['schemas'\\]\\['${wire}'\\],\\s*'${key}',\\s*${t}\\s*>`
            )
          );
        }
      }
    }
    expect(found).toBeGreaterThanOrEqual(3);
  });

  it('pairs every `Pick<Wire, …>` read model with a GuardSubset', () => {
    // A subset is NOT a subtype — it is missing required properties — so
    // `GuardNarrowing` rejects it outright and a third helper exists for it.
    // ‼ Swept, not listed: `GuardSubset` arrived guarding one of the three
    // `Pick`-derived read models in `lib/knowledge/types.ts`, and the other two
    // shipped unguarded beside it.
    let found = 0;
    for (const [file, src] of guarded) {
      const aliases = aliasesOf(src);
      const subsets = src.matchAll(/(?:export )?type (\w+) = Pick<\s*(\w+),/g);
      for (const [, local, wireRef] of subsets) {
        if (!schemaNamed(wireRef, aliases)) continue;
        found += 1;
        expect(src, `${file}: ${local} subsets ${wireRef} but has no GuardSubset`).toMatch(
          new RegExp(`GuardSubset<\\s*${wireRef},\\s*${local}\\s*>`)
        );
      }
    }
    expect(found).toBeGreaterThanOrEqual(3);
  });
});

describe('the helpers are declared ONCE, as constraints', () => {
  it('no file re-declares a guard primitive', () => {
    // THE #174 FIX, asserted directly, over EVERY app file rather than a list —
    // a fresh copy in a module nobody listed is exactly the regression this
    // test exists to prevent.
    for (const [file, src] of Object.entries(stripped)) {
      for (const prim of ['_Assert', '_IsSubtype', '_NotNullable']) {
        expect(src, `${file} re-declares ${prim}`).not.toMatch(new RegExp(`type\\s+${prim}\\s*<`));
      }
    }
  });

  it('exports no loose primitive to reach for instead of the pairing', () => {
    // The helpers apply their whole pairing as ONE type, so a narrowing gets
    // both checks or neither. Exporting `_IsSubtype` beside them would put the
    // half-guarded form back within reach, which is all it takes.
    const exported = [...stripped[HELPERS].matchAll(/export type (\w+)/g)].map((m) => m[1]);
    expect(exported.sort()).toEqual(['GuardNarrowedMember', 'GuardNarrowing', 'GuardSubset']);
  });

  it('states every check as a TYPE-PARAMETER constraint, not in the body', () => {
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
    expect(helpers).toMatch(/Narrowed extends Wire &/);
    expect(helpers).toMatch(/Record<Exclude<keyof Narrowed, keyof Wire>, never>/);
    expect(helpers).toMatch(/NullishPreserved<Wire, Narrowed>/);
    expect(helpers).toMatch(/Key extends keyof Wire/);
    expect(helpers).toMatch(
      /Narrowed extends Wire\[Key\] & \(null extends Wire\[Key\] \? never : unknown\)/
    );
    expect(helpers).toMatch(/Subset extends Partial<Wire> &/);
  });

  it('catches a key going nullable or optional, which subtyping cannot see', () => {
    // ‼ `Narrowed extends Wire` HOLDS when the wire turns a key nullable — a
    // `T[]` is assignable to `T[] | null` — and the key sets are unchanged, so
    // the `Record` arm sees nothing either. Measured: without the third arm, a
    // wire whose `cases` became `T[] | null` (or `cases?:`) compiled with ZERO
    // errors while the alias went on declaring it required and non-null.
    //
    // Both halves of "missing" are compared, which is why it is `Extract<T,
    // null | undefined>` on each side and not `null extends T`.
    const helpers = stripped[HELPERS];
    expect(helpers).toMatch(/Extract<Wire\[K\], null \| undefined>/);
    expect(helpers).toMatch(/Extract<Narrowed\[K\], null \| undefined>/);
  });

  it('never resolves a check to `never`, and never strips nullability', () => {
    for (const [file, src] of Object.entries(stripped)) {
      const region = file === HELPERS ? src : guardRegion(src);
      if (!region) continue;
      // ‼ A conditional type that resolves to `never` IS NOT AN ERROR — it is
      // just `never`, and the build stays green. `lib/knowledge/types.ts`
      // carried exactly that form, so its bidirectional "is the contract shape"
      // check was inert. Only a constraint rejects.
      expect(region, `${file} has an inert \`? true : never\` guard`).not.toMatch(
        /\?\s*true\s*\n?\s*:\s*never/
      );
      // ‼ `NonNullable<Wire[K]>` erases exactly the change the `& { k?: N }`
      // narrowing cannot survive: the intersection annihilates the `null`, so
      // consumers are told `source` is always one of three literals while rows
      // arrive `null`. Measured — with `NonNullable` the change compiled clean.
      expect(region, file).not.toMatch(/NonNullable<\s*components\['schemas'\]\['\w+'\]\['\w+'\]/);
      expect(region, file).not.toMatch(/NonNullable<\s*Wire\[Key\]/);
      // And no guard may hand-restate a key list.
      expect(region, file).not.toMatch(/Pick<\s*components\['schemas'\]\['\w+'\],\s*'/);
    }
  });
});
