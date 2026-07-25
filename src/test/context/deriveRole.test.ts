import { describe, it, expect } from 'vitest';
import { deriveRole } from '../../context/AuthContext';

/**
 * ADR-012 D9 split one ambiguous backend role string into two:
 *
 *   platform_admin — deployment operator, cross-tenant reach
 *   admin          — organization-scoped, tenant-bounded
 *
 * The dashboard's `platform_admin` means the FIRST one. These tests pin that,
 * because keying on `admin` again would silently offer the operator UI to every
 * org admin in cloud — the failure mode is a visible-but-403 surface, not a
 * crash, so only a test catches it.
 */
describe('deriveRole', () => {
  it('treats a cloud platform_admin as platform_admin', () => {
    expect(deriveRole('cloud', ['user', 'platform_admin'])).toBe('platform_admin');
  });

  it('does NOT treat a cloud org admin as platform_admin', () => {
    expect(deriveRole('cloud', ['user', 'admin'])).toBe('standard_user');
  });

  it('treats a plain cloud user as standard_user', () => {
    expect(deriveRole('cloud', ['user'])).toBe('standard_user');
  });

  it('handles an empty roles list in cloud', () => {
    expect(deriveRole('cloud', [])).toBe('standard_user');
  });

  it('collapses every standalone account to individual', () => {
    // Standalone is single-tenant/single-operator: the role axis carries no
    // dashboard meaning there, so even a platform_admin reads as individual.
    expect(deriveRole('standalone', ['user', 'admin', 'platform_admin'])).toBe('individual');
    expect(deriveRole('standalone', ['user'])).toBe('individual');
  });
});
