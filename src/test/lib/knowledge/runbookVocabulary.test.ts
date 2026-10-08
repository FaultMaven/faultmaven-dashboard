import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_SCOPES,
  RUNBOOK_DIFFICULTIES,
  RUNBOOK_DOMAINS,
  RUNBOOK_SEVERITIES,
  SYMPTOM_CLASSES,
} from '../../../lib/knowledge/runbookVocabulary';

/** The members of a generated string-literal union, in the spec's order. */
function generatedUnion(name: string): string[] {
  const source = readFileSync('src/types/api.generated.ts', 'utf8');
  const match = new RegExp(`^\\s+${name}: ((?:"[^"]+"(?: \\| )?)+);`, 'm').exec(source);
  if (!match) throw new Error(`${name} not found in api.generated.ts`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

// Compile-time exhaustiveness is `exactly` in runbookVocabulary.ts; this pins
// the ORDER the spec defines, which the type system cannot see.
describe('runbook vocabulary mirrors the generated contract enums', () => {
  it.each([
    ['RunbookDomain', RUNBOOK_DOMAINS],
    ['RunbookSeverity', RUNBOOK_SEVERITIES],
    ['RunbookDifficulty', RUNBOOK_DIFFICULTIES],
    ['SymptomClass', SYMPTOM_CLASSES],
    ['KnowledgeScope', KNOWLEDGE_SCOPES],
  ] as const)('%s', (name, values) => {
    expect([...values]).toEqual(generatedUnion(name));
  });
});
