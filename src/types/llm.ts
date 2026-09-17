import type { components } from './api.generated';

// ============================================================================
// LLM configuration types, bound to the pinned contract (#165)
// ============================================================================
//
// These were restated by hand, so `api-types-drift` could not see them: it
// regenerates from the pinned ref, finds no diff, and stays green while this
// app reads fields the adopted contract does not contain.
//
// ‼ THE NARROWED UNIONS ARE KEPT ON PURPOSE. The contract types
// `primary_provider`, `state`, `deployment` and friends as bare `string`,
// because that is what FastAPI publishes for them. The UI switches on the
// members — a provider picker, a state badge — so binding them straight to
// `string` would be a DOWNGRADE that removes exhaustiveness checking from
// every consumer. Bind the names, keep the guarantees the app relies on.
//
// The idiom for that is `Omit<Wire, K> & { K: Narrowed }`, as `types/cases.ts`
// already does. See the guards at the bottom for the hole it leaves.

/** Providers the router can route to. Narrower than the contract's `string`. */
export type ProviderName =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'fireworks'
  | 'groq'
  | 'huggingface'
  | 'cohere'
  | 'openrouter'
  | 'local';

export type ProviderState = 'not_configured' | 'configured' | 'active';

/**
 * What `primary_provider` can actually be.
 *
 * ‼ `"none"` is a real value, not a placeholder: the backend computes
 * `primary = fallback_chain[0] if fallback_chain else "none"`. A cloud account
 * with no initialised provider gets it — and that is exactly the account whose
 * `config_readonly` is false, so it is the one rendering the editable select.
 * Leaving it out of the union hid a real state from every consumer.
 */
export type PrimaryProvider = ProviderName | 'none';

/** One provider's live state, from `GET /admin/llm/config`. */
export type LLMProvider = Omit<components['schemas']['LLMProviderDetail'], 'name' | 'state'> & {
  name: ProviderName;
  state: ProviderState;
};

/** `GET /api/v1/admin/llm/config`. */
export type LLMConfig = Omit<
  components['schemas']['LLMConfigResponse'],
  'deployment' | 'primary_provider' | 'fallback_chain' | 'providers'
> & {
  deployment: 'standalone' | 'cloud';
  primary_provider: PrimaryProvider;
  fallback_chain: ProviderName[];
  providers: Record<string, LLMProvider>;
};

/** `PUT /api/v1/admin/llm/config` — the request body. */
export type LLMConfigUpdate = Omit<
  components['schemas']['LLMConfigUpdateRequest'],
  'primary_provider' | 'fallback_chain' | 'provider_name'
> & {
  primary_provider?: ProviderName | null;
  fallback_chain?: ProviderName[] | null;
  provider_name?: ProviderName | null;
};

/** `POST /api/v1/admin/llm/config/test`. */
export type ProviderConnectionTestResult = components['schemas']['LLMConnectionTestResponse'];

/** One feature's configuration state, inside `EnvConfigStatus`. */
export type FeatureStatus = components['schemas']['FeatureStatus'];

/**
 * `GET /api/v1/admin/config/status`.
 *
 * ‼ ONLY `auth_mode` and `deployment` are narrowed, and that is a correction.
 * The hand-written type this replaces also narrowed `db_backend`,
 * `session_storage` and `vector_storage` — and all three unions were FALSE
 * against the running backend, which sends descriptive strings:
 *
 *   session_storage  "fakeredis (inmemory)"                          not 'inmemory'
 *   vector_storage   "chromadb (persistent, split: kb + evidence)"   not 'chromadb'
 *   db_backend       `settings.database.case_storage_type`, overwritten only
 *                    when an alembic.ini is found and parseable
 *
 * Nothing switches on them (`EnvConfigStatusPanel` renders the raw string), so
 * the lie was invisible — and would have stayed invisible until the first
 * exhaustive `switch`, which would then have missed every real value. The
 * contract's `string` is the honest type. A narrowing is a claim about what
 * the server sends, so it has to be checked against the server, not inherited
 * from whoever wrote it first.
 */
export type EnvConfigStatus = Omit<
  components['schemas']['EnvConfigStatusResponse'],
  'auth_mode' | 'deployment'
> & {
  auth_mode: 'local' | 'oauth';
  deployment: 'standalone' | 'cloud';
};

// ============================================================================
// Compile-time guards
// ============================================================================
//
// ‼ `Omit` IS BLIND TO THE RENAME IT LOOKS LIKE IT CATCHES. Its key parameter
// is `keyof any`, not `keyof T`, so `Omit<Wire, 'gone'>` omits nothing and
// compiles clean — and the `& { gone: Narrowed }` half then puts the field
// back. A client goes on reading a key the contract dropped, which is the very
// defect the binding exists to prevent. Measured: `Omit` reports nothing,
// `Pick` reports TS2344.
//
// ‼ THE GUARDS DERIVE THEIR KEYS, they do not restate them. A hand-written
// `Pick<Wire, 'a' | 'b'>` is a second list that must be kept in step with the
// `Omit` beside it, and the day someone narrows a third key and forgets to add
// it, the guard silently stops covering it — the same blindness one level up.
// `keyof Narrowed` cannot drift from the type it is taken from. This is the
// form `lib/knowledge/types.ts` already uses; restating the keys here was a
// regression from it.
//
// These live in an app file, not a test: `tsconfig.json` excludes
// `src/test/**` and CI's only typecheck runs against it. They erase completely.

/**
 * …and each narrowed member is still a SUBTYPE of the wire member.
 *
 * Existence alone would accept a member whose type changed underneath — a
 * `string` field becoming a number, or an object swapped for another schema.
 */
type _IsSubtype<Narrowed, Wire> = [Narrowed] extends [Wire] ? true : false;

/**
 * Forces the check above to FAIL THE BUILD rather than merely evaluate oddly.
 *
 * ‼ A conditional type that resolves to `never` is not an error — it is just
 * `never`, and the build stays green. The assertion has to be expressed as a
 * CONSTRAINT (`T extends true`) for the compiler to reject it. Measured: the
 * `never` form reported nothing when a narrowed member's type changed
 * underneath it, which is the whole failure this was meant to catch.
 */
type _Assert<T extends true> = T;

// `Pick<Wire, keyof Narrowed>` is written out per type rather than wrapped in a
// generic helper: inside a generic, `keyof Narrowed` widens to
// `string | number | symbol` and no longer satisfies `keyof Wire`, so the
// helper compiles for everything and checks nothing.
export type LlmTypeGuards = {
  providerKeys: Pick<components['schemas']['LLMProviderDetail'], keyof LLMProvider>;
  providerSubtype: _Assert<_IsSubtype<LLMProvider, components['schemas']['LLMProviderDetail']>>;

  configKeys: Pick<components['schemas']['LLMConfigResponse'], keyof LLMConfig>;
  configSubtype: _Assert<_IsSubtype<LLMConfig, components['schemas']['LLMConfigResponse']>>;

  updateKeys: Pick<components['schemas']['LLMConfigUpdateRequest'], keyof LLMConfigUpdate>;
  updateSubtype: _Assert<_IsSubtype<LLMConfigUpdate, components['schemas']['LLMConfigUpdateRequest']>>;

  envKeys: Pick<components['schemas']['EnvConfigStatusResponse'], keyof EnvConfigStatus>;
  envSubtype: _Assert<_IsSubtype<EnvConfigStatus, components['schemas']['EnvConfigStatusResponse']>>;
};
