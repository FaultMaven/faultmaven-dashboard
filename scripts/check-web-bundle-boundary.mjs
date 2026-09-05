#!/usr/bin/env node
/**
 * The built web bundle must contain no sign-in from the Copilot UI package.
 *
 * ADR-016 D3: the built-in panel exists only inside the authenticated app
 * shell, and the panel never renders a sign-in of its own — the host supplies
 * the session. The shared UI's host contract makes that structural (its
 * `HostSession` is non-nullable, so there is no value the panel can be mounted
 * with that lacks a signed-in user), and the copilot repository asserts that
 * `AuthScreen` and `LocalLoginForm` are not in the package at all.
 *
 * This is the assertion on the OTHER side of the boundary, and it is not the
 * same assertion: it looks at what this repository actually SHIPS. A deep
 * import, a transitive edge through a barrel, or a future package that quietly
 * re-exported the extension's screens would all be invisible to a source-level
 * grep in the producing repo and visible here.
 *
 * "Two sign-in boxes visible at once" is the defect the whole programme
 * removes, and a sign-in inside the panel is the version of it that no route
 * guard can prevent.
 *
 * Run AFTER `pnpm build`:
 *     pnpm build && node scripts/check-web-bundle-boundary.mjs
 */
import { collectBuildOutputOrExit, fail, readAll } from './gate-support.mjs';

const DIST = 'dist';

/**
 * Strings that identify the extension's sign-in screens.
 *
 * The USER-VISIBLE COPY is what carries this gate. String literals survive
 * minification, so a screen that reached the bundle is named here whatever the
 * mangler did to its component. The two component names are a bonus for an
 * unminified build, not the load-bearing half.
 *
 * Every one of these is absent from this repository's own sources — checked,
 * so a marker cannot silently start matching the Dashboard's own login page and
 * make this gate permanently red for the wrong reason.
 */
const SIGNIN_MARKERS = [
  'AuthScreen',
  'LocalLoginForm',
  'Sign in with Organization',
  "Sign in using your organization's SSO",
  'Register for a new FaultMaven account',
  'Enter your password (if set)',
];

/*
 * `.js` AND `.css`. Shipped code only — sourcemaps were scanned here first and
 * the gate went red immediately, on a COMMENT: the package's host adapter
 * documents why the shared UI has no state in which it could render
 * `AuthScreen`, and a sourcemap embeds that prose verbatim. A gate that fires
 * on a file saying the right thing is a gate people turn off.
 *
 * The stylesheet is included because a sign-in screen leaves its mark there
 * too — the classes it needs are emitted only if its markup reached the
 * `content` scan — so a screen that slipped in without its copy being obvious
 * in the JS is still visible in the CSS.
 */
const files = collectBuildOutputOrExit(DIST, ['.js', '.css'], 'this gate');

if (SIGNIN_MARKERS.length === 0) {
  fail('No markers configured. Nothing was searched for; that is not a pass.');
  process.exit(1);
}

const bundle = readAll(files);

const hits = SIGNIN_MARKERS.filter((marker) => bundle.includes(marker));

if (hits.length > 0) {
  for (const marker of hits) {
    fail(`the built bundle contains ${JSON.stringify(marker)} — a Copilot sign-in reached the web build.`);
  }
  console.error('');
  console.error('The built-in panel must never render a sign-in (ADR-016 D3): the Dashboard');
  console.error('shows exactly one sign-in action, and the host supplies the session.');
  process.exit(1);
}

console.log(
  `OK: ${files.length} built file(s) scanned for ${SIGNIN_MARKERS.length} sign-in markers; none present.`,
);
