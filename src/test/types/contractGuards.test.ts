import { describe, it, expect } from 'vitest';

import { stripComments } from '../support/stripComments';
import { findGuardCalls, findNarrowings } from '../support/contractNarrowings';

/**
 * ONE subject for every contract guard in the app (#174).
 *
 * This replaces the per-file source checks that grew alongside #171–#173. The
 * guards themselves are type-level and live in app files, where the app's own
 * typecheck (`pnpm typecheck`, against `tsconfig.json`, which excludes
 * `src/test/**`) enforces them. What this file holds is the
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
 * outside the app typecheck that gates the build, which is the placement this
 * whole module exists to prevent, enforced by the test.
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
 * ‼ The WHY of line-comments-first lives with the helper, in
 * `src/test/support/stripComments.ts`, and is not restated here. Two copies of
 * a reason drift — which is the thesis of the change this file tests.
 */
const stripped: Record<string, string> = Object.fromEntries(
  Object.entries(sources).map(([f, raw]) => [f, stripComments(raw)])
);

const HELPERS = 'src/types/contractGuards.ts';

/** Every app file that names a contract schema — the helper module aside. */
const guarded = Object.entries(stripped).filter(
  ([f, src]) => f !== HELPERS && src.includes("components['schemas']")
);

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
  // ‼ ALL THREE tokens. Checking only `GuardNarrowing<` returned '' for a file
  // guarding read models with `GuardSubset` alone, and the caller skips an
  // empty region — so every ban below silently stopped running on it.
  if (!block) return /Guard(?:Narrowing|NarrowedMember|Subset)</.test(src) ? src : '';
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
    // ‼ All FOUR guard sites plus the helpers. Omitting `lib/knowledge/types.ts`
    // — the site this PR's triage found the issue had missed — meant the glob
    // could stop resolving it while `guarded.length >= 4` still held on the
    // other three, silently dropping all three `GuardSubset` pairings.
    for (const f of [
      HELPERS,
      'src/types/llm.ts',
      'src/types/cases.ts',
      'src/lib/auth/functions.ts',
      'src/lib/knowledge/types.ts',
    ]) {
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

describe('every narrowing is guarded, and the list is PARSED', () => {
  // ‼ The narrowings are found by PARSING each source, never restated here and
  // no longer pattern-matched. Three review rounds each found more spellings a
  // regex could not see — `Pick<components['schemas']['X'], …>`, a declaration
  // wrapped after the `=`, an inline nested object read as sibling members, and
  // a schema alias imported from another file — every one of them ordinary, and
  // every one measured with an unguarded probe that kept the suite green. See
  // `src/test/support/contractNarrowings.ts`.
  const narrowings = findNarrowings(sources);
  const guardCalls = findGuardCalls(sources);
  const guarded = (guard: string, pred: (args: string[]) => boolean) =>
    guardCalls.some((g) => g.guard === guard && pred(g.args));

  it('finds the narrowings that are actually there', () => {
    // A parser that silently stops returning anything makes every `for` below
    // vacuous. These floors are the shape of the tree today.
    const n = (k: string) => narrowings.filter((x) => x.kind === k).length;
    expect(n('whole'), 'whole-shape narrowings').toBeGreaterThanOrEqual(10);
    expect(n('member'), 'member narrowings').toBeGreaterThanOrEqual(3);
    expect(n('subset'), 'Pick-derived read models').toBeGreaterThanOrEqual(3);
    expect(guardCalls.length).toBeGreaterThanOrEqual(16);
  });

  it('pairs every `Omit<Wire, K> & { K: N }` narrowing with a GuardNarrowing', () => {
    for (const x of narrowings) {
      if (x.kind !== 'whole') continue;
      expect(
        guarded('GuardNarrowing', (a) => a[1] === x.local),
        `${x.file}: ${x.local} narrows ${x.wire} but has no GuardNarrowing`
      ).toBe(true);
    }
  });

  it('pairs every `Wire & { k?: N }` member narrowing with a GuardNarrowedMember', () => {
    for (const x of narrowings) {
      if (x.kind !== 'member') continue;
      // ‼ REQUIRED member narrowings are refused, not silently admitted. The
      // guard cannot police them: `Narrowed` does not carry the declaration's
      // optionality, so `& { k: N }` and `& { k?: N }` pass it the same type,
      // and the wire turning the key optional is then indistinguishable from
      // the three optional narrowings that must stay green. For a required one
      // the intersection annihilates the `undefined` exactly as it annihilates
      // `null`, so consumers would be told the key is always present while the
      // server omits it.
      expect(
        x.optional,
        `${x.file}: ${x.local}.${x.key} is a REQUIRED member narrowing, which ` +
          `GuardNarrowedMember cannot check — declare it \`${x.key}?:\` (see contractGuards.ts)`
      ).toBe(true);
      // ‼ The guard must name the type the DECLARATION uses. Deriving the third
      // argument instead (`Local['k']`) is the obvious fix and is wrong: that
      // alias is an intersection WITH THE WIRE, so a wire retype flows into
      // both sides and cancels out — measured, it compiles clean on exactly the
      // mutation the guard exists to catch. A test can compare two spellings
      // without creating that circularity; a type cannot.
      expect(
        guarded(
          'GuardNarrowedMember',
          (a) => a[1] === `'${x.key}'` && a[2] === x.type && a[0].includes(`'${x.wire}'`)
        ),
        `${x.file}: ${x.local} narrows ${x.wire}.${x.key} as ${x.type} — ` +
          `GuardNarrowedMember must name that same type`
      ).toBe(true);
    }
  });

  it('pairs every `Pick<Wire, …>` read model with a GuardSubset', () => {
    // A subset is NOT a subtype — it is missing required properties — so
    // `GuardNarrowing` rejects it outright and a third helper exists for it.
    for (const x of narrowings) {
      if (x.kind !== 'subset') continue;
      expect(
        guarded('GuardSubset', (a) => a[1] === x.local),
        `${x.file}: ${x.local} subsets ${x.wire} but has no GuardSubset`
      ).toBe(true);
    }
  });
});

describe('the helpers are declared ONCE, as constraints', () => {
  it('no file re-declares a guard primitive', () => {
    // THE #174 FIX, asserted over EVERY app file.
    //
    // ‼ THE BAN IS ON THE SHAPE, NOT ON THREE NAMES. A list of `_Assert` /
    // `_IsSubtype` / `_NotNullable` is itself the hand-written list this whole
    // file argues against: a fresh loose primitive called `_Sub`, `_KeysExist`
    // or `IsSubtype` re-creates #174 in a new module with every test green.
    // What identifies one is the bracketed-tuple conditional they are all
    // spelled with — `[A] extends [B] ? … : …` — which is also why it catches
    // the inert `? … : never` variants without enumerating those either.
    for (const [file, src] of Object.entries(stripped)) {
      if (file === HELPERS) continue;
      expect(
        src,
        `${file} declares a loose guard primitive — the pairing helpers in ` +
          `${HELPERS} are the only place this shape belongs`
      ).not.toMatch(/type\s+\w+<[^>]*>\s*=\s*\[[^\]]+\]\s+extends\s+\[/);
      // The three original names, still, so a copy under its old name is named
      // in the failure rather than described.
      for (const prim of ['_Assert', '_IsSubtype', '_NotNullable']) {
        expect(src, `${file} re-declares ${prim}`).not.toMatch(new RegExp(`type\\s+${prim}\\s*<`));
      }
    }
  });

  it('leaves no single-line block comment that the strip order would swallow', () => {
    // ‼ THE MIRROR HAZARD OF LINE-COMMENTS-FIRST. Stripping `//` first is right
    // — it stops a `// … /*` from opening a block match that eats real
    // declarations — but it has its own failure: a single-line
    // `/* keep this // note */` loses its `*/` to the line stripper, and the
    // block stripper then runs from that `/*` to the NEXT `*/` anywhere in the
    // file, deleting declarations after it. Every `not.toMatch` in every source
    // test then passes against a hole.
    //
    // Two files were flipped to this order when `stripComments` was extracted,
    // and the sweep now runs it over all app files rather than three hand-picked
    // ones — so the exposure is far larger than it was. Nothing asserted against
    // it; this does.
    for (const [file, raw] of Object.entries(sources)) {
      // `[^:\n]` before the `//` mirrors the line stripper's OWN exemption:
      // it skips a `//` preceded by `:`, so `/* see https://x */` is safe and
      // must not be flagged. Anything else on one line is not.
      expect(raw, `${file} has a single-line block comment containing \`//\``).not.toMatch(
        /\/\*[^\n]*[^:\n]\/\/[^\n]*\*\//
      );
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
    expect(helpers).toMatch(/Subset extends Pick<Wire, Extract<keyof Subset, keyof Wire>> &/);
    // ‼ NOT `Partial<Wire>`. Partial makes every key optional and so erases the
    // required/optional distinction: measured, a hand-written subset declaring
    // `owner_id: string` against a contract saying `owner_id?: string | null`
    // compiled CLEAN, and `row.owner_id.slice(0, 8)` would throw — the `user_id`
    // defect in its next disguise, on the guard whose job is to survive exactly
    // that replacement.
    expect(helpers).not.toMatch(/Subset extends Partial<Wire>/);
    expect(helpers).toMatch(/NullishPreserved<Wire, Subset>/);
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
