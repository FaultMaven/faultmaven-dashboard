import { describe, it, expect } from 'vitest';
import { readRolesFromAccessToken } from '../../lib/auth/AuthManager';

/**
 * The stored `user` is a login-time snapshot and refresh replaces only tokens,
 * so without reading roles back off the refreshed token a session that predates
 * a role change keeps its old UI indefinitely. Neither backend grant path
 * revokes tokens, so that window is unbounded.
 *
 * The failure mode that matters most is the malformed case: returning `[]`
 * rather than `null` would let a bad token silently strip a user's roles.
 */

function makeToken(payload: unknown): string {
  const base64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${base64url(payload)}.signature`;
}

describe('readRolesFromAccessToken', () => {
  it('reads the roles claim', () => {
    const token = makeToken({ sub: 'u1', roles: ['user', 'admin', 'platform_admin'] });
    expect(readRolesFromAccessToken(token)).toEqual(['user', 'admin', 'platform_admin']);
  });

  it('picks up a role the login snapshot did not have', () => {
    // The upgrade case: promoted after this session started.
    expect(readRolesFromAccessToken(makeToken({ roles: ['user', 'admin', 'platform_admin'] })))
      .toContain('platform_admin');
  });

  it('returns an empty list for a token with no roles', () => {
    expect(readRolesFromAccessToken(makeToken({ roles: [] }))).toEqual([]);
  });

  it('returns null when the claim is absent', () => {
    expect(readRolesFromAccessToken(makeToken({ sub: 'u1' }))).toBeNull();
  });

  it('returns null for a malformed token rather than an empty role set', () => {
    // Null means "no opinion, keep what you had". Empty would mean "this user
    // has no roles", which would strip the UI on a garbled token.
    expect(readRolesFromAccessToken('not-a-jwt')).toBeNull();
    expect(readRolesFromAccessToken('')).toBeNull();
    expect(readRolesFromAccessToken('a.!!!not-base64!!!.c')).toBeNull();
  });

  it('drops non-string entries instead of trusting the claim shape', () => {
    expect(readRolesFromAccessToken(makeToken({ roles: ['user', 42, null, 'platform_admin'] })))
      .toEqual(['user', 'platform_admin']);
  });

  it('returns null when roles is not an array', () => {
    expect(readRolesFromAccessToken(makeToken({ roles: 'platform_admin' }))).toBeNull();
  });
});
