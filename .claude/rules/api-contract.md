---
paths:
  - "src/types/**"
  - "api-contract.pin.json"
  - "scripts/generate-api-types.mjs"
  - "scripts/report-contract-hop.mjs"
  - "src/lib/knowledge/types.ts"
  - "src/lib/auth/functions.ts"
  - "src/test/types/**"
  - "src/test/support/contractNarrowings.ts"
  - "src/test/scripts/contractHopReport.test.ts"
---

# The API contract: generated types, the pin, and the narrowing guards

## Generated types

`src/types/api.generated.ts` is **generated** from faultmaven's committed
`docs/reference/api/openapi.json` — never edit it by hand.

```bash
pnpm generate:api-types
```

By default it reads the spec from the core commit pinned in
`api-contract.pin.json`, which is the same file the `api-types-drift` CI job
reads — so the local command and the gate cannot disagree about which contract is
in force. It does **not** follow `main`: a backend merge reaches this client only
when a pull request here moves `ref` (and `contractVersion` to match), and that
commit is where this repository accepts the change. Point the generator elsewhere
to build against a contract you have not adopted — `--spec` works identically on
every platform:

```bash
pnpm generate:api-types --spec ../faultmaven/docs/reference/api/openapi.json
```

`FM_OPENAPI_SPEC` does the same and is what CI sets. The environment-prefix form
is POSIX-only — neither `cmd.exe` nor PowerShell accepts it:

```bash
FM_OPENAPI_SPEC=../faultmaven/docs/reference/api/openapi.json pnpm generate:api-types   # bash/zsh
```
```
set FM_OPENAPI_SPEC=..\faultmaven\docs\reference\api\openapi.json && pnpm generate:api-types   :: cmd.exe
$env:FM_OPENAPI_SPEC = "..\faultmaven\docs\reference\api\openapi.json"; pnpm generate:api-types   # PowerShell
```

Prefer `--spec` — it avoids the question entirely.

⚠️ Do **not** generate from a live server (`http://localhost:8090/openapi.json`).
Generating against whatever build happens to be running is how this repo and the
other frontend ended up with different names for the same schema (fm#880).

A spec change in faultmaven does **not** turn this repository red: the job
regenerates from the pinned commit, so merging there reaches nothing here.
`api-types-drift` goes red when the generated file stops matching the contract
this repo pins — `ref` moved without a regeneration, or the generated file was
edited by hand. It also fails when the pin's `contractVersion` disagrees with the
version the pinned ref serves. Adopt a new contract in a PR of its own, pin and
regenerated types together, rather than folding it into unrelated work; the job
prints every contract entry the bump crossed (`scripts/report-contract-hop.mjs`,
advisory) into the job summary for the reviewer.

The `copilot-ui-pin` job carries the CONSISTENCY leg: the copilot repository's
`api-contract.pin.json` at the pinned package SHA must equal this repository's.

## Narrowing the contract: `src/types/contractGuards.ts`

A type aliased straight to a generated schema cannot drift. A type that
**narrows** one can, and the app narrows deliberately: the contract types
`primary_provider`, `state`, `source` and friends as bare `string` (that is what
FastAPI publishes), while the UI switches on the members. Binding straight
through would be a DOWNGRADE that removes exhaustiveness checking from every
consumer. So a narrowing is a *claim* about the contract, and every one carries
a compile-time guard.

‼ The guards live in **app files, never tests**. `tsconfig.json` excludes
`src/test/**` and CI's only typecheck (`pnpm typecheck`) runs against it, so a
type-level assertion in a test file is evaluated by nothing. They erase
completely — no runtime cost.

One helper per narrowing KIND, and each applies its whole pairing as a **single
type**, so a narrowing gets both checks or neither:

| Narrowing | Guard | Catches |
|---|---|---|
| `Omit<Wire, K> & { K: N }` | `GuardNarrowing<Wire, N>` | the wire renaming/dropping `K`, `K`'s type changing underneath, and `K` becoming **nullable or optional** |
| `Wire & { k?: N }` | `GuardNarrowedMember<Wire, 'k', N>` | the wire dropping `k`, retyping it, or making it **nullable** |
| `Pick<Wire, K1 \| K2>` | `GuardSubset<Wire, Subset>` | an invented key, a shared member retyped **or widened**, and an optional-or-nullable member **promoted to required** |

- ‼ **`Omit` IS BLIND TO THE RENAME IT LOOKS LIKE IT CATCHES.** Its key
  parameter is `keyof any`, not `keyof T`, so `Omit<Wire, 'cases'>` omits
  NOTHING once the wire has no `cases`, and the `& { cases: … }` half puts the
  field back. Measured: renaming `CaseListResponse.cases` produced ZERO errors,
  and `listCases` would have rendered an empty case list with `tsc`,
  `api-types-drift` and the whole suite green.
- ‼ **Subtyping cannot see a key going nullable.** `Narrowed extends Wire` HOLDS
  when the wire turns `cases` into `T[] | null` — a `T[]` is assignable to it —
  and the key set is unchanged, so the keys arm sees nothing either. Measured:
  without a third arm comparing `Extract<T, null | undefined>` on both sides,
  that change compiled with ZERO errors while the alias went on declaring the
  key required and non-null, and `listCases` would run `.cases.map` on `null`.
  Optional and nullable are two different ways to go missing and both count.
- ‼ **A member narrowing must be declared OPTIONAL** (`& { k?: N }`); the source
  test refuses a required one. The guard cannot police that shape — `Narrowed`
  does not carry the declaration's optionality, so `& { k: N }` and `& { k?: N }`
  pass it the same type — and for a required narrowing the intersection
  annihilates `undefined` exactly as it annihilates `null`, telling every
  consumer the key is always present while the server omits it. A shape the
  guard cannot check is refused at the door rather than admitted unchecked.
- ‼ **`GuardSubset` uses `Pick<Wire, …>`, never `Partial<Wire>`.** Partial makes
  every key optional and so erases the required/optional distinction: measured,
  a hand-written subset declaring `owner_id: string` against a contract saying
  `owner_id?: string | null` compiled CLEAN, and `row.owner_id.slice(0, 8)`
  would throw.
- ‼ **A member narrowing's guard NAMES its type, it does not derive it.**
  `GuardNarrowedMember<Wire, 'source', CaseSource>`, never
  `CaseSummary['source']` — that alias is an *intersection with the wire*, so a
  wire retype flows into both sides and cancels out. Measured: the derived form
  compiles clean on exactly the mutation the guard exists to catch. The
  declaration and the guard are kept in step by the source test, which reads
  both spellings — a test can compare them without the circularity.
- ‼ **A conditional type that resolves to `never` is not an error.** It is just
  `never`, and the build stays green — `document: never` is a legal member.
  `lib/knowledge/types.ts` carried exactly that form, so its bidirectional check
  was inert. Only a CONSTRAINT rejects.
- ‼ **The constraint must sit on a TYPE PARAMETER, not in the body.** Measured
  on TS 5.8, every in-body form fails at the DECLARATION site, before it guards
  anything: `Pick<Wire, keyof Narrowed>` (`keyof Narrowed` widens to
  `string | number | symbol`), `_Assert<KeysExist<W, N>>` (a deferred
  conditional's constraint is `boolean`, not `true`), and a `= keyof N`
  parameter default (checked eagerly). A parameter constraint is deferred to the
  INSTANTIATION, where the concrete types are known.
- ‼ **NO `NonNullable` on the wire side, ever.** It erases exactly the change a
  `& { k?: N }` narrowing cannot survive: the intersection annihilates `null`,
  so consumers are told `source` is always one of three literals while rows
  arrive `null`, every `switch` falls through, and the ADR-012 origin badge
  renders nothing with no error. Measured — with `NonNullable` that change
  compiled clean.
- ‼ **The primitives are NOT exported**, and that is the fix, not an oversight.
  `_Assert`/`_IsSubtype` were declared in three files plus a fourth partial copy;
  the copies diverged inside a single pair of PRs and produced two measured holes
  (#174). A loose `_IsSubtype` is what gets reached for instead of the pairing —
  which is how `functions.ts` grew a bespoke `[number]` refinement that let
  `scopes: string[]` → `string` compile clean.

`src/test/types/contractGuards.test.ts` is the ONE subject for all of this, and
it **parses** each source (`src/test/support/contractNarrowings.ts`, via the
TypeScript AST) rather than pattern-matching it — so a narrowing added to a file
nobody remembered is still covered. Three per-file tests, each blind to the
other two, is what #174 was.

‼ **The sweep was regexes and the regexes kept being wrong the same way.** Three
review rounds each found more spellings it could not see, all ordinary:
`Pick<components['schemas']['X'], …>`, a declaration wrapped after the `=`, an
inline nested object whose keys were read as siblings, and a schema alias
imported from another file. Each was measured with an unguarded probe that kept
the whole suite green. A regex cannot be made to read TypeScript, so it no
longer tries: `ts.createSourceFile` is a parse only — no program, no type
checker — costing milliseconds per file.
