import { describe, it, expect } from 'vitest';
import { canWriteDocument } from '../../../lib/knowledge/writePolicy';

/**
 * The client write gate against the server's policy, as a table.
 *
 * `ensure_document_write_allowed` governs PUT and DELETE alike:
 *
 *     global          -> platform admin (single-tenant only)
 *     personal / team -> the OWNER, or the platform operator (single-tenant)
 *
 * The rows marked ‼ are the ones that were wrong, and the reason this is a
 * table in a unit test rather than six page renders: the `team` bug survived
 * as a `TODO` for as long as probing it meant booting `KBPage` with four
 * mocks and asserting on a rendered button.
 */
const OWNER = 'u-1';
const OTHER = 'u-2';

describe('canWriteDocument', () => {
  const cases: [string, { scope: string; owner_id: string | null }, boolean, string | null, boolean][] = [
    // description,                                    doc,                                    isAdmin, userId, expected
    ['‼ the AUTHOR of a team runbook may write it',    { scope: 'team', owner_id: OWNER },     false,   OWNER,  true],
    ['a non-owner may not write a team runbook',       { scope: 'team', owner_id: OTHER },     false,   OWNER,  false],
    ['the operator may write a team runbook',          { scope: 'team', owner_id: OTHER },     true,    OWNER,  true],

    ['the author of a personal runbook may write it',  { scope: 'personal', owner_id: OWNER }, false,   OWNER,  true],
    ['a non-owner may not write a personal runbook',   { scope: 'personal', owner_id: OTHER }, false,   OWNER,  false],
    // ADR-012: operator access to tenant content is break-glass, never standing.
    ['‼ NOT even the operator, on personal scope',     { scope: 'personal', owner_id: OTHER }, true,    OWNER,  false],

    ['global is operator-only',                        { scope: 'global', owner_id: null },    true,    OWNER,  true],
    ['global is refused to everyone else',             { scope: 'global', owner_id: null },    false,   OWNER,  false],

    // null === null would otherwise unlock every unowned row for a viewer the
    // app could not identify.
    ['‼ an unowned doc and an unidentified viewer',    { scope: 'personal', owner_id: null },  false,   null,   false],
    ['an unowned team doc, unidentified viewer',       { scope: 'team', owner_id: null },      false,   null,   false],
  ];

  for (const [description, doc, isAdmin, userId, expected] of cases) {
    it(description, () => {
      expect(canWriteDocument(doc, isAdmin, userId)).toBe(expected);
    });
  }

  it('fails closed when the scope is missing', () => {
    // No scope reads as `global`, i.e. operator-only — never as "anyone".
    expect(canWriteDocument({ owner_id: OWNER }, false, OWNER)).toBe(false);
    expect(canWriteDocument({ owner_id: OWNER }, true, OWNER)).toBe(true);
  });

  it('refuses a scope it does not know', () => {
    expect(canWriteDocument({ scope: 'enterprise', owner_id: OWNER }, true, OWNER)).toBe(false);
  });
});
