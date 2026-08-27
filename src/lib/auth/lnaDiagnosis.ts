/**
 * Diagnose whether Chrome's Local Network Access permission is the likely
 * reason a fetch to the API failed.
 *
 * Chrome ≥142 gates public-site → local-address requests behind a per-origin
 * permission with NO server-side opt-out; a blocked config fetch on networks
 * where the API host resolves privately (split-horizon DNS) is exactly how the
 * dashboard ends up unable to confirm its deployment. The permission name is
 * 'local-network' as of Chrome 145, with the launch-era 'local-network-access'
 * kept as an alias; other browsers throw on unknown names, hence the
 * try-per-name loop.
 *
 * Call this only AFTER a fetch has already failed, and treat any resolvable
 * state other than 'granted' as the likely cause: a dismissed prompt leaves
 * the state at 'prompt' while requests stay blocked, so a 'denied'-only check
 * would miss most real cases.
 *
 * Detection only — never pass `targetAddressSpace` on the actual fetches: the
 * same bundle serves users whose API resolves publicly, and a declared
 * address-space mismatch fails the request outright.
 */
export async function localNetworkAccessLikelyBlocked(): Promise<boolean> {
  for (const name of ['local-network', 'local-network-access']) {
    try {
      const status = await navigator.permissions.query({ name: name as PermissionName });
      return status.state !== 'granted';
    } catch {
      // Unknown permission name in this browser — try the next alias.
    }
  }
  return false;
}
