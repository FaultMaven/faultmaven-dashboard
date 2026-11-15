/**
 * What "the Copilot UI pin is behind" means, in one place.
 *
 * Two readers ask it. The PR gate (`check-copilot-ui-pin.mjs`) prints it as an
 * advisory NOTE and never fails on it, and the daily report
 * (`report-pin-staleness.mjs`) turns it into one tracking issue. If each kept
 * its own definition, the issue could say "behind" while the gate said
 * nothing, or the reverse.
 */

export const COPILOT_REPO = 'FaultMaven/faultmaven-copilot';
export const COPILOT_BRANCH = 'main';
export const PACKAGE_SUBTREE = 'packages/copilot-ui/';

/**
 * The files under the package that changed between the pin and the branch, from
 * a GitHub `compare/<pin>...<branch>` response. Narrowed to the package: the
 * rest of that repository (the extension, its CI, its docs) is not in the
 * Dashboard's bundle, so a change there does not leave the pin behind.
 */
export function packageChanges(comparison) {
  return (comparison?.files ?? []).filter((file) => (file?.filename ?? '').startsWith(PACKAGE_SUBTREE));
}
