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
 *
 * `multiTenant` is `features.multiTenant` from `/meta/capabilities`
 * (FaultMaven/faultmaven#1489): under it the server refuses the operator arm.
 */
const OWNER = 'u-1';
const OTHER = 'u-2';
const SINGLE = false;
const MULTI = true;

describe('canWriteDocument', () => {
  const cases: [string, { scope: string; owner_id: string | null }, boolean, string | null, boolean, boolean][] = [
    // description,                                    doc,                                    isAdmin, userId, multiTenant, expected
    ['‼ the AUTHOR of a team runbook may write it',    { scope: 'team', owner_id: OWNER },     false,   OWNER,  MULTI,  true],
    ['the author of a team runbook, single-tenant',    { scope: 'team', owner_id: OWNER },     false,   OWNER,  SINGLE, true],
    ['a non-owner may not write a team runbook',       { scope: 'team', owner_id: OTHER },     false,   OWNER,  SINGLE, false],
    ['the operator may write a team runbook, single-tenant', { scope: 'team', owner_id: OTHER }, true,  OWNER,  SINGLE, true],
    ['‼ NOT the operator on a team runbook, multi-tenant', { scope: 'team', owner_id: OTHER }, true,    OWNER,  MULTI,  false],
    // The owner arm holds for an admin too: multi-tenant removes only the operator arm.
    ['an operator who OWNS a team runbook, multi-tenant', { scope: 'team', owner_id: OWNER }, true,    OWNER,  MULTI,  true],

    ['the author of a personal runbook may write it',  { scope: 'personal', owner_id: OWNER }, false,   OWNER,  MULTI,  true],
    ['a non-owner may not write a personal runbook',   { scope: 'personal', owner_id: OTHER }, false,   OWNER,  SINGLE, false],
    // ADR-012: operator access to tenant content is break-glass, never standing.
    ['‼ NOT even the operator, on personal scope',     { scope: 'personal', owner_id: OTHER }, true,    OWNER,  SINGLE, false],
    ['nor the operator on personal scope, multi-tenant', { scope: 'personal', owner_id: OTHER }, true,  OWNER,  MULTI,  false],

    ['global is operator-only, single-tenant',         { scope: 'global', owner_id: null },    true,    OWNER,  SINGLE, true],
    ['‼ NOT the operator on global, multi-tenant',     { scope: 'global', owner_id: null },    true,    OWNER,  MULTI,  false],
    ['global is refused to everyone else',             { scope: 'global', owner_id: null },    false,   OWNER,  SINGLE, false],

    // null === null would otherwise unlock every unowned row for a viewer the
    // app could not identify.
    ['‼ an unowned doc and an unidentified viewer',    { scope: 'personal', owner_id: null },  false,   null,   SINGLE, false],
    ['an unowned team doc, unidentified viewer',       { scope: 'team', owner_id: null },      false,   null,   SINGLE, false],
  ];

  for (const [description, doc, isAdmin, userId, multiTenant, expected] of cases) {
    it(description, () => {
      expect(canWriteDocument(doc, isAdmin, userId, multiTenant)).toBe(expected);
    });
  }

  it('fails closed when the scope is missing', () => {
    // No scope reads as `global`, i.e. operator-only — never as "anyone".
    expect(canWriteDocument({ owner_id: OWNER }, false, OWNER, SINGLE)).toBe(false);
    expect(canWriteDocument({ owner_id: OWNER }, true, OWNER, SINGLE)).toBe(true);
    expect(canWriteDocument({ owner_id: OWNER }, true, OWNER, MULTI)).toBe(false);
  });

  it('refuses a scope it does not know', () => {
    expect(canWriteDocument({ scope: 'enterprise', owner_id: OWNER }, true, OWNER, SINGLE)).toBe(false);
  });
});
