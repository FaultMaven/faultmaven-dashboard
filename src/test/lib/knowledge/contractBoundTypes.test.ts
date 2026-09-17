import { describe, it, expect } from 'vitest';
import type { components } from '../../../types/api.generated';
import type { KBDocument } from '../../../lib/knowledge/types';

/**
 * KB response shapes are BOUND to the pinned contract, not restated.
 *
 * `api-types-drift` regenerates `api.generated.ts` from the commit named in
 * `api-contract.pin.json` and fails when the two disagree. That gate can only
 * see a field the app reads THROUGH the generated types. A response parsed into
 * a hand-written interface is invisible to it: the regeneration finds no diff,
 * the job stays green, and a field the backend renamed becomes a runtime
 * `undefined` instead of a build failure (faultmaven-dashboard#165).
 *
 * This had already happened here. `KBDocument` declared a REQUIRED `user_id`
 * that the backend's `KnowledgeBaseDocument` has never carried, and
 * `KBPage.canModifyDocument` read it inside a permission gate.
 *
 * Two checks, because each catches a different way back:
 *
 *  - the TYPE check below is compile-time only, and `tsconfig.json` excludes
 *    `src/test/**`, so it is enforced by `pnpm lint:tests` / `tsc -p
 *    tsconfig.eslint.json` rather than by the app build;
 *  - the SOURCE check runs at test time and is what catches someone replacing
 *    the alias with a fresh `export interface KBDocument { … }`, which would
 *    satisfy nothing above and fail no build.
 */
describe('knowledge types are sourced from the generated contract', () => {
  it('binds KBDocument to the contract schema, structurally', () => {
    // Assignable in BOTH directions = the same type, not merely a subset.
    // A one-way check passes for a hand-written subset of the real schema,
    // which is exactly the shape that drifts without anyone noticing.
    type Contract = components['schemas']['KnowledgeBaseDocument'];
    const toContract = (d: KBDocument): Contract => d;
    const fromContract = (d: Contract): KBDocument => d;

    expect(toContract).toBeTypeOf('function');
    expect(fromContract).toBeTypeOf('function');
  });

  it('declares no hand-written document interface to drift', async () => {
    const source = (
      await import('../../../lib/knowledge/types.ts?raw')
    ).default as string;

    // The alias is the binding. If this line goes, the gate goes blind.
    expect(source).toMatch(
      /export type KBDocument =\s*components\['schemas'\]\['KnowledgeBaseDocument'\];/
    );
    // …and no `interface KBDocument` may reappear beside it.
    expect(source).not.toMatch(/interface\s+KBDocument\b/);

    // `user_id` specifically: the field that was declared here, read by a
    // permission gate, and never present on any response. Asserted against the
    // CODE with comments stripped — the surrounding prose names the field
    // deliberately, to explain why it must not come back, and a naive scan of
    // the whole file would make documenting the defect impossible.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\buser_id\b/);
  });
});
