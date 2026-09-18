import { describe, it, expect } from 'vitest';

import { stripComments } from '../../support/stripComments';

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
 * ‼ THE TYPE-LEVEL GUARDS ARE NOT IN THIS FILE. They live at the bottom of
 * `src/lib/knowledge/types.ts`, because `tsconfig.json` excludes `src/test/**`
 * and CI's only typecheck is `pnpm typecheck` against it. A `const f = (d: A):
 * B => d` written here is checked by nothing — `lint:tests` is ESLint, which
 * reports lint violations and not assignability, and `tsc -p
 * tsconfig.eslint.json` is run by no workflow and is already red on main. An
 * assertion that no job evaluates is decoration; this file was drafted with
 * one, and it would have passed against any body at all.
 *
 * What is left here is the SOURCE check — the thing a type cannot state:
 * that the binding is still spelled the way it has to be spelled.
 */

const raw = (await import('../../../lib/knowledge/types.ts?raw')).default as unknown as string;

/**
 * The source with COMMENTS REMOVED.
 *
 * Asserting on the raw file is how `authConfigContractBinding.test.ts` was
 * vacuous on its first run: the comment explaining the binding named the very
 * type it was checking for, so reverting the code still matched and still
 * passed. A source test that PROSE can satisfy proves nothing about the code —
 * and the comments below deliberately name `user_id` and `interface`, so
 * asserting on the raw text here would be wrong in both directions.
 *
 * The `[^:]` guard on the line-comment strip is load-bearing: without it a
 * `https://` anywhere in the file eats the rest of its line, silently removing
 * code from what the assertions see.
 */
const source = stripComments(raw);

/** The `KBDocumentListItem` declaration alone, `export type` through `>;`. */
function listItemDeclaration(): string {
  const m = source.match(/export type KBDocumentListItem[\s\S]*?>;/);
  // Fail closed: a rename must surface as a failure, not an empty haystack
  // that every `not.toContain` below passes against.
  expect(m, 'KBDocumentListItem declaration not found').not.toBeNull();
  return m![0];
}

/** The `KBDocument` alias line alone. */
function documentDeclaration(): string {
  const m = source.match(/export type KBDocument\s*=[\s\S]*?;/);
  expect(m, 'KBDocument declaration not found').not.toBeNull();
  return m![0];
}

describe('knowledge types are sourced from the generated contract', () => {
  it('reads the source at all, with comments stripped', () => {
    // Fail closed. A renamed module, a Vite resolution change or a strip that
    // ate the file would make every assertion below vacuously true.
    expect(raw.length).toBeGreaterThan(1_000);
    expect(source.length).toBeGreaterThan(400);
    expect(source).toContain('KBDocument');
    // The strip must actually remove prose, or we are matching comments again.
    expect(source.length).toBeLessThan(raw.length);
    expect(source).not.toContain('bind the names');
  });

  it('binds the document to the contract schema', () => {
    expect(source).toContain("components['schemas']['KnowledgeBaseDocument']");
    // No hand-written restatement beside it, under either declaration keyword.
    // `interface` alone would miss `export type KBDocument = { … }`.
    expect(source).not.toMatch(/interface\s+KBDocument\b/);
    expect(source).not.toMatch(/type\s+KBDocument\s*=\s*\{/);
  });

  it('derives the list row from the document rather than aliasing it', () => {
    // `GET /knowledge/documents` sends a strict subset — no `content`,
    // `status` or `verification_*`. Aliasing the row to the full document
    // promises fields the endpoint never sends, which is the #165 defect with
    // a REQUIRED type instead of an optional one.
    expect(source).toMatch(/KBDocumentListItem\s*=\s*Pick<\s*KBDocument/);
    expect(source).not.toMatch(/KBDocumentListItem\s*=\s*KBDocument\s*;/);

    // Scoped to the DECLARATION, not a character window: `KBDocumentUpdateResult`
    // sits just below and legitimately picks `content`, so a loose window
    // reports a failure for the neighbour's field.
    const decl = listItemDeclaration();
    for (const absent of ['content', 'status', 'verification_level', 'verification_status']) {
      expect(decl).not.toContain(`'${absent}'`);
    }
  });

  it('keeps the compile-time guards where CI can see them', () => {
    // If these move to a test file they stop being enforced — see the note at
    // the top of this file. Their SHAPE is asserted once for the whole app in
    // `src/test/types/contractGuards.test.ts`; what matters here is that this
    // file still carries them.
    expect(source).toContain('GuardNarrowing<');
    expect(source).toContain('GuardSubset<');
    expect(source).toMatch(/document:\s*_DocumentIsContractShape/);
    // ‼ The REVERSE guard too. It is the only one that catches `KBDocument`
    // narrowing a contract member — the forward guard already covers missing
    // keys, invented keys and incompatible retypes — so deleting it leaves
    // `tsc` and every other test green while the "BOTH WAYS ROUND" invariant
    // this file's own doc comment states goes unenforced.
    expect(source).toMatch(/documentReverse:\s*_ContractIsDocumentShape/);
    expect(source).toMatch(/listItem:\s*_ListItemMatchesContract/);
  });

  it('declares no phantom fields', () => {
    // `user_id` was declared here, read by a permission gate, and never
    // present on any response. `team_id` was invented too, and read nowhere.
    // `user_id` is legitimate nowhere in this module — no KB shape, request or
    // response, has ever carried one.
    expect(source).not.toMatch(/\buser_id\b/);
    // `team_id` IS legitimate on `UploadDocumentParams` (a multipart REQUEST
    // field), so this is scoped to the response shapes, where it was invented.
    expect(listItemDeclaration()).not.toMatch(/\bteam_id\b/);
    expect(documentDeclaration()).not.toMatch(/\bteam_id\b/);
  });
});
