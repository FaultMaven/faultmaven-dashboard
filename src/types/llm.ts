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
  primary_provider: ProviderName;
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

/** `PUT /api/v1/admin/llm/config` — the response. */
export type LLMConfigUpdateResult = components['schemas']['LLMConfigUpdateResponse'];

/** `POST /api/v1/admin/llm/config/test`. */
export type ProviderConnectionTestResult = components['schemas']['LLMConnectionTestResponse'];

/** One feature's configuration state, inside `EnvConfigStatus`. */
export type FeatureStatus = components['schemas']['FeatureStatus'];

/** `GET /api/v1/admin/config/status`. */
export type EnvConfigStatus = Omit<
  components['schemas']['EnvConfigStatusResponse'],
  'auth_mode' | 'deployment' | 'db_backend' | 'session_storage' | 'vector_storage'
> & {
  auth_mode: 'local' | 'oauth';
  deployment: 'standalone' | 'cloud';
  db_backend: 'sqlite' | 'postgresql';
  session_storage: 'inmemory' | 'redis';
  vector_storage: 'inmemory' | 'chromadb';
};

// ============================================================================
// Compile-time guards
// ============================================================================
//
// ‼ `Omit` IS BLIND TO THE RENAME IT LOOKS LIKE IT CATCHES. Its key parameter
// is `keyof any`, not `keyof T`, so `Omit<Wire, 'gone'>` omits nothing and
// compiles clean — and the `& { gone: Narrowed }` half then puts the field
// back. A client goes on reading a key the contract no longer has, which is
// precisely the #165 defect the binding exists to prevent. Measured: `Omit`
// reports nothing, `Pick` reports TS2344.
//
// So every key narrowed above is re-stated through `Pick`, which constrains to
// `keyof T` and fails the build. These live in an app file, not a test:
// `tsconfig.json` excludes `src/test/**` and CI's only typecheck runs against
// it, so a type assertion in a test file is enforced by nothing.
//
// They erase completely — no runtime cost.

/** Every key `LLMProvider` narrows still exists on the wire type. */
type _ProviderNarrowedKeys = Pick<components['schemas']['LLMProviderDetail'], 'name' | 'state'>;

/** …and likewise for the config envelope. */
type _ConfigNarrowedKeys = Pick<
  components['schemas']['LLMConfigResponse'],
  'deployment' | 'primary_provider' | 'fallback_chain' | 'providers'
>;

/** …the update request. */
type _UpdateNarrowedKeys = Pick<
  components['schemas']['LLMConfigUpdateRequest'],
  'primary_provider' | 'fallback_chain' | 'provider_name'
>;

/** …and the env status. */
type _EnvNarrowedKeys = Pick<
  components['schemas']['EnvConfigStatusResponse'],
  'auth_mode' | 'deployment' | 'db_backend' | 'session_storage' | 'vector_storage'
>;

export type LlmTypeGuards = {
  provider: _ProviderNarrowedKeys;
  config: _ConfigNarrowedKeys;
  update: _UpdateNarrowedKeys;
  env: _EnvNarrowedKeys;
};
