/**
 * Runbook taxonomy, derived from the contract (faultmaven#1886).
 *
 * The API publishes these as enums (`RunbookDomain`, `SymptomClass`,
 * `RunbookSeverity`, `RunbookDifficulty`, `KnowledgeScope`). openapi-typescript
 * emits string-literal UNIONS, which erase at runtime, so the option lists a
 * form renders need a runtime array. Each array below is checked against the
 * generated union in both directions by `exactly`: a value the contract adds
 * or removes makes `pnpm typecheck` fail until this file follows. The order is
 * the spec's enum order (pinned by `runbookVocabulary.test.ts`).
 */
import type { components } from '../../types/api.generated';

type Schemas = components['schemas'];

export type SymptomClass = Schemas['SymptomClass'];

type Vocabulary<U extends string, A extends readonly string[]> =
  [Exclude<U, A[number]>] extends [never]
    ? [Exclude<A[number], U>] extends [never]
      ? A
      : never
    : never;

/**
 * Identity at runtime; at compile time, `values` must list exactly the members
 * of `U`. The compiler does NOT catch duplicates or order: the Vitest order
 * test (`runbookVocabulary.test.ts`) does.
 */
const exactly =
  <U extends string>() =>
  <const A extends readonly U[]>(values: A & Vocabulary<U, A>): A =>
    values;

export const RUNBOOK_DOMAINS = exactly<Schemas['RunbookDomain']>()([
  'database', 'networking', 'compute', 'application', 'security', 'storage', 'messaging',
]);

export const RUNBOOK_SEVERITIES = exactly<Schemas['RunbookSeverity']>()([
  'critical', 'high', 'medium', 'low', 'info',
]);

export const RUNBOOK_DIFFICULTIES = exactly<Schemas['RunbookDifficulty']>()([
  'beginner', 'intermediate', 'advanced', 'expert',
]);

export const SYMPTOM_CLASSES = exactly<Schemas['SymptomClass']>()([
  'auth_failure',
  'connection_refused',
  'cpu_saturation',
  'crash_loop',
  'data_loss',
  'deployment_failure',
  'disk_full',
  'image_pull_failure',
  'latency',
  'node_failure',
  'oom',
  'replication_lag',
  'scheduling_failure',
  'service_unavailable',
  'throughput_degradation',
  'timeout',
]);

export const KNOWLEDGE_SCOPES = exactly<Schemas['KnowledgeScope']>()([
  'global', 'team', 'personal',
]);

/** Narrow a free string (a `<select>` value) to a member of a vocabulary. */
export function isMember<A extends readonly string[]>(values: A, value: string): value is A[number] {
  return (values as readonly string[]).includes(value);
}
