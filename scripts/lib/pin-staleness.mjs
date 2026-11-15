/**
 * Where the Copilot UI lives, and which of its files the Dashboard bundles.
 *
 * Two readers ask whether the pin is behind, and they answer different
 * questions on purpose:
 *
 *   - the PR gate (`check-copilot-ui-pin.mjs`) prints an advisory NOTE from the
 *     compare file list, and compares the contract pin with what core serves;
 *   - the daily report (`report-pin-staleness.mjs`) decides whether to keep an
 *     issue open, so it also reads the package's own commit history (the
 *     compare file list is capped at 300 files repository-wide) and measures
 *     the contract against copilot's pin, the one target the pin-parity check
 *     lets this repository adopt.
 *
 * What they share is this module: the repository, the branch, and the one
 * rule for which changed files are the package's.
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
