/**
 * Compile-time guards for types that NARROW the generated contract.
 *
 * `api.generated.ts` is regenerated from the pinned spec, so a type aliased
 * straight to a schema cannot drift. A type that narrows one can: the app
 * declares `primary_provider` as a union where the contract says `string`,
 * because the UI switches on the members and binding straight through would
 * remove exhaustiveness checking from every consumer. Those narrowings are
 * claims about the contract, and this file is where the compiler checks them.
 *
 * ‼ THESE LIVE IN AN APP FILE, NOT A TEST, so `pnpm typecheck` — the same
 * check `pnpm build` runs — enforces them beside the types they guard.
 * `tsconfig.json` excludes `src/test/**`; a test file is type-checked only by
 * the separate `pnpm typecheck:tests`, under the test environment. They erase
 * completely — no runtime cost, no emitted code.
 *
 * ## Why one helper per narrowing KIND, and no loose primitives
 *
 * This file replaces three hand-rolled copies of `_Assert` / `_IsSubtype` /
 * `_NotNullable` (`types/llm.ts`, `types/cases.ts`, `lib/auth/functions.ts`)
 * plus a fourth partial copy in `lib/knowledge/types.ts`.
 *
 * ‼ The copies diverged INSIDE #171–#173, and the divergence produced two
 * measured holes: an earlier revision of `cases.ts` carried the keys check
 * without the subtype check on four of five narrowings, and an earlier revision
 * of `functions.ts` substituted a bespoke `[number]` refinement for it. Both
 * compiled clean against a mutated contract; both were corrected in review
 * before they merged, so `git show` on the commit this file replaces will not
 * find them — what it will find is four copies that had already drifted apart
 * once and would do it again (faultmaven-dashboard#174).
 *
 * The cause was that guarding a narrowing took TWO checks applied by hand, so
 * it could be done half-way. Each helper below applies its whole pairing as a
 * SINGLE type — a narrowing gets both checks or neither, and there is no way
 * to spell the half-guarded form.
 *
 * That is also why the primitives are not exported. An exported `_IsSubtype`
 * is the thing the next person reaches for instead of the pairing, which is
 * precisely how `functions.ts` grew its bespoke variant.
 *
 * ## Why these work as CONSTRAINTS and nothing else does
 *
 * Both holes above had the same root: the guards were written as types that
 * EVALUATE rather than constraints that REJECT.
 *
 * ‼ A conditional type that resolves to `never` is not an error. It is just
 * `never`, and the build stays green. Only a constraint (`T extends U`) makes
 * the compiler reject the instantiation.
 *
 * ‼ AND THE CONSTRAINT MUST SIT ON A TYPE PARAMETER, not inside the body.
 * Measured on TypeScript 5.8, every in-body form fails at the DECLARATION
 * site, before it ever guards anything:
 *
 *   Pick<Wire, keyof Narrowed>        TS2344 — `keyof Narrowed` widens to
 *                                     `string | number | symbol` inside a
 *                                     generic and stops satisfying `keyof Wire`
 *   _Assert<KeysExist<W, N>>          TS2344 — a deferred conditional's
 *                                     constraint is `boolean`, not `true`
 *   <..., _K extends keyof W = keyof N>  TS2344 — a parameter default is
 *                                     checked against its constraint eagerly
 *
 * This is why `llm.ts` and `cases.ts` both carried a comment saying a generic
 * helper "compiles for everything and checks nothing". That was true of the
 * `Pick` formulation they measured, and it is not true of the problem: a
 * constraint on the type parameter is deferred to the INSTANTIATION, which is
 * where the concrete types are known. The forms below are measured in
 * `src/test/types/contractGuards.test.ts`.
 */

/**
 * `null` / `undefined` are still in the same places on both sides.
 *
 * ‼ NEITHER OF THE OTHER TWO CHECKS CAN SEE THIS, and the `Omit` idiom is what
 * makes it dangerous. `Narrowed extends Wire` holds happily when the wire turns
 * a key nullable — `T[]` IS assignable to `T[] | null` — and the key sets are
 * unchanged, so the `Record` arm sees nothing either. Measured on TS 5.8:
 * without this arm, a wire whose `cases` became `T[] | null` (or `cases?:`)
 * compiled with ZERO errors, while the alias went on declaring it required and
 * non-null. `listCases` would then run `.cases.map` on `null`, and
 * `getAvailableScopes` `.filter` on a missing `scopes` — with `tsc`,
 * `api-types-drift` and the whole suite green. That is the same class of defect
 * `GuardNarrowedMember` has an explicit arm for; this is the whole-shape one.
 *
 * The comparison is `Extract<T, null | undefined>` on each side rather than
 * `null extends T`, because OPTIONAL and NULLABLE are two different ways for
 * the value to go missing and both matter. A key that is optional on BOTH sides
 * is fine — `LLMConfigUpdate.primary_provider?` narrows an already-optional
 * wire field, and must stay green.
 */
type NullishPreserved<Wire, Narrowed> = {
  [K in Extract<keyof Narrowed, keyof Wire>]?: [Extract<Wire[K], null | undefined>] extends [
    Extract<Narrowed[K], null | undefined>,
  ]
    ? unknown
    : never;
};

/**
 * Guards `Omit<Wire, K> & { K: Narrowed }` — the whole-shape narrowing.
 *
 * Catches BOTH failures, which is the point of it being one type:
 *
 * - **The wire renaming or dropping the overridden key.** ‼ `Omit` IS BLIND TO
 *   THE RENAME IT LOOKS LIKE IT CATCHES: its key parameter is `keyof any`, not
 *   `keyof T`, so `Omit<Wire, 'cases'>` omits NOTHING once the wire has no
 *   `cases`, and the `& { cases: … }` half puts the field back. The alias goes
 *   on promising a key the contract dropped. Measured: renaming
 *   `CaseListResponse.cases` in `api.generated.ts` produced ZERO errors, and
 *   `listCases` would have rendered an empty case list with `tsc`,
 *   `api-types-drift` and the whole suite green.
 *
 *   `Record<Exclude<keyof Narrowed, keyof Wire>, never>` is what catches it.
 *   Every key of `Narrowed` that is NOT on `Wire` is required to be `never`,
 *   which no real property satisfies — including an optional one, since
 *   `zzz?: 'x'` is not assignable to a required `zzz: never`. When the key sets
 *   agree, `Exclude` is `never`, `Record<never, never>` is `{}`, and the
 *   constraint costs nothing.
 *
 *   ‼ THE KEYS ARE DERIVED, never restated. A hand-written
 *   `Pick<Wire, 'a' | 'b'>` is a second list to keep in step, and the day
 *   someone narrows a third key and forgets it, the guard silently stops
 *   covering it — the same blindness one level up.
 *
 * - **The overridden member's TYPE changing underneath**, via `Narrowed extends
 *   Wire`. Existence alone would accept a `string` field becoming a number, or
 *   an object swapped for another schema.
 *
 * - **The member becoming NULLABLE or OPTIONAL**, via `NullishPreserved` above
 *   — which neither of the other two can see.
 *
 * No one of them substitutes for another: an extra key is still a structural
 * subtype, so `extends Wire` alone misses the rename; a retyped member keeps
 * the key set intact, so the `Record` alone misses the retype; and a nullable
 * member is both a subtype and key-identical, so only the third arm catches
 * it.
 *
 * ⚠️ Not for `Wire & { k?: N }` narrowings — see `GuardNarrowedMember`. An
 * intersection is always assignable to its own parts, so this degenerates to a
 * tautology on them.
 *
 * @example
 *   type CaseListResponse = Omit<components['schemas']['CaseListResponse'], 'cases'>
 *     & { cases: CaseSummary[] };
 *
 *   export type CaseTypeGuards = {
 *     list: GuardNarrowing<components['schemas']['CaseListResponse'], CaseListResponse>;
 *   };
 */
export type GuardNarrowing<
  Wire,
  Narrowed extends Wire &
    Record<Exclude<keyof Narrowed, keyof Wire>, never> &
    NullishPreserved<Wire, Narrowed>,
> = Narrowed;

/**
 * Guards `Wire & { k?: Narrowed }` — narrowing ONE member in place.
 *
 * A different shape needs a different guard, and the obvious one is a
 * tautology: an intersection is always assignable to its own parts, so
 * `GuardNarrowing<Wire, Wire & { source?: CaseSource }>` is satisfied no matter
 * what the wire does.
 *
 * Three failures, all caught here, none caught by a plain subtype check:
 *
 * - **The wire dropping the key** — `Key extends keyof Wire`. The indexed
 *   access is what bites: `Wire['source']` stops compiling the moment the wire
 *   has no `source`, and the `&` half would otherwise keep promising it.
 *
 * - **The member being retyped** — `Narrowed extends Wire[Key]`.
 *
 * - **The member becoming NULLABLE** — the `null extends Wire[Key] ? never :
 *   unknown` arm, which collapses the constraint to `never` and rejects every
 *   instantiation.
 *
 *   ‼ THIS IS THE ONE A SUBTYPE CHECK CANNOT SEE, and it is the change this
 *   narrowing is least able to survive. A union of string literals is happily
 *   assignable to `string | null`, so the subtype check stays true exactly when
 *   the intersection has become a lie: `Wire & { source?: CaseSource }`
 *   computes `source` as `(string | null) & (CaseSource | undefined)` — the
 *   `null` is ANNIHILATED by the intersection — so every consumer is told
 *   `source` is always one of three literals while rows arrive with `null`,
 *   every `switch` falls through, and the ADR-012 origin badge renders nothing
 *   with no error.
 *
 *   ‼ NO `NonNullable` ANYWHERE IN HERE. Wrapping the wire side erases exactly
 *   that `null` before comparing, and the guard stays green on precisely the
 *   change it exists to catch. Measured.
 *
 * A WIDENED wire is deliberately accepted: narrowing `string` to a union is the
 * whole purpose, so `Wire[Key]` growing more permissive is not a failure.
 *
 * ‼ THE NARROWED MEMBER MUST BE DECLARED OPTIONAL (`& { k?: N }`), and the
 * source test rejects a required one rather than letting it through unchecked.
 * This guard CANNOT check the required form, and the reason is that `Narrowed`
 * does not carry the declaration's optionality: `& { k?: N }` and `& { k: N }`
 * both pass `N` here. So the wire turning an already-narrowed key optional is
 * indistinguishable from today's three narrowings, which are optional over a
 * required wire and must stay green.
 *
 * That matters because for a REQUIRED narrowing the intersection annihilates
 * the `undefined` exactly as it annihilates `null` — `(X | undefined) & N` is
 * `N` — so every consumer would be told the key is always present while the
 * server omits it. A shape the guard cannot police is refused at the door
 * instead.
 *
 * @example
 *   type CaseSummary = components['schemas']['CaseSummary'] & { source?: CaseSource };
 *
 *   export type CaseTypeGuards = {
 *     summarySource: GuardNarrowedMember<components['schemas']['CaseSummary'], 'source', CaseSource>;
 *   };
 */
export type GuardNarrowedMember<
  Wire,
  Key extends keyof Wire,
  Narrowed extends Wire[Key] & (null extends Wire[Key] ? never : unknown),
> = Narrowed;

/**
 * Guards `Pick<Wire, K1 | K2 | …>` — a SUBSET of the wire shape.
 *
 * A subset is not a subtype (it is missing required properties), so
 * `GuardNarrowing` rejects it outright. This is the read-model case: a list row
 * that carries a few of a document's fields, declared to keep a component from
 * depending on the rest.
 *
 * - **An invented key** — `Record<Exclude<keyof Subset, keyof Wire>, never>`,
 *   the same mechanism as above. This is the failure that matters: a subset is
 *   derived with `Pick` today, and the day someone replaces it with a
 *   hand-written object type, a field the contract never had can slip in and be
 *   read as `undefined` forever.
 *
 * - **A shared member being retyped or WIDENED** — `Pick<Wire, Extract<keyof
 *   Subset, keyof Wire>>`, which keeps only the keys the subset carries and
 *   leaves the absent ones absent, because absent keys are the point.
 *
 * - **An optional-or-nullable member PROMOTED to required** — the same
 *   `NullishPreserved` arm `GuardNarrowing` uses. ‼ This was `Partial<Wire>`,
 *   which makes every key optional and so erases the distinction entirely:
 *   measured, a hand-written subset declaring `owner_id: string` against a
 *   contract that says `owner_id?: string | null` compiled CLEAN, and
 *   `row.owner_id.slice(0, 8)` would throw. That is the `user_id` defect this
 *   file exists to prevent, in its next disguise — and surviving a hand-written
 *   replacement is the guard's whole stated job.
 *
 *   ‼ Unlike `GuardNarrowedMember`, a widened member is REJECTED here, and the
 *   asymmetry is deliberate. There the app narrows a deliberately-loose wire
 *   type (`string` → a union) and the wire growing looser is expected. Here the
 *   subset is meant to be the contract's own type, so `string` where the
 *   contract says `'a' | 'b'` is drift.
 *
 * ‼ A bare `Pick<Wire, keyof Subset>` — what `lib/knowledge/types.ts` carried —
 * checks key existence and NOTHING about the member types. It passes on a
 * subset whose `content` has become a number.
 *
 * @example
 *   type KBDocumentListItem = Pick<KBDocument, 'document_id' | 'title'>;
 *
 *   export type KnowledgeTypeGuards = {
 *     listItem: GuardSubset<KBDocument, KBDocumentListItem>;
 *   };
 */
export type GuardSubset<
  Wire,
  Subset extends Pick<Wire, Extract<keyof Subset, keyof Wire>> &
    Record<Exclude<keyof Subset, keyof Wire>, never> &
    NullishPreserved<Wire, Subset>,
> = Subset;
