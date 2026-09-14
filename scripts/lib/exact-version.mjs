/**
 * An EXACT version, not a range.
 *
 * `packageParity` requires the two repositories' generated API clients to be
 * byte-identical, so the GENERATOR is as much a part of that output as the spec
 * is. Two lockfiles resolving different `openapi-typescript` releases fail that
 * test with a diff nobody authored, while the pin check passes because it
 * compares pin files rather than generated ones.
 *
 * A `^`/`~` blacklist was the first attempt and let `>=7.10.1`, `7.x`, `*`,
 * `latest` and `7.10.1 - 7.11.0` through — every one of them the drift the rule
 * exists to stop, and all invisible precisely BECAUSE both repositories agreed
 * on the same range string.
 *
 * Its own module so the rule is testable: the both-repos-agree-on-a-range path
 * cannot be reached by editing only this repository, and importing the gate
 * script to reach the predicate would run the gate.
 */
export function isExactVersion(spec) {
  return /^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/.test(String(spec ?? ''));
}
