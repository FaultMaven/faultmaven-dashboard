#!/usr/bin/env node
/**
 * The shared UI's classes have to reach the built stylesheet.
 *
 * A MISSING TAILWIND TOKEN IS NOT AN ERROR. The class is simply never emitted,
 * the element renders unstyled, and nothing is thrown, logged or turned red —
 * which is why this needs a gate rather than a habit.
 *
 * There are two ways to arrive there and both are one line of config away:
 *
 *  - `content` is the one key Tailwind does NOT merge across presets. A
 *    config's array REPLACES the preset's, so a host that lists only its own
 *    `src/**` purges every class the package uses.
 *  - the package is installed as a SYMLINK by pnpm, so a glob that does not
 *    resolve through it matches nothing while looking perfectly correct.
 *
 * The classes below are chosen because the Dashboard's own sources never use
 * them — before ADR-016 they were not even in its token set. If they are in the
 * stylesheet, the package's sources were scanned; if they are not, this build
 * ships an unstyled panel.
 *
 * Run AFTER `pnpm build`:
 *     pnpm build && node scripts/check-shared-ui-styles.mjs
 */
import { collectBuildOutputOrExit, fail, readAll } from './gate-support.mjs';

const ASSETS = 'dist/assets';

/**
 * Classes the shared UI uses and this app's own sources do not.
 *
 * `verbatim` is how the class appears in the built CSS. Tailwind escapes the
 * `:` of a variant, so `hover:bg-fm-accent-strong` is emitted as
 * `.hover\:bg-fm-accent-strong:hover` — checking for `.bg-fm-accent-strong`
 * would report a false failure, which is exactly what a first pass of this
 * check did by hand.
 */
const SHARED_UI_CLASSES = [
  { name: 'bg-fm-bg', verbatim: '.bg-fm-bg' },
  { name: 'font-fm-sans', verbatim: '.font-fm-sans' },
  { name: 'hover:bg-fm-accent-strong', verbatim: 'hover\\:bg-fm-accent-strong' },
];

const files = collectBuildOutputOrExit(ASSETS, ['.css'], 'this gate');

if (SHARED_UI_CLASSES.length === 0) {
  fail('No classes configured. Nothing was searched for; that is not a pass.');
  process.exit(1);
}

const css = readAll(files);

/**
 * The package's base styles must not escape the panel.
 *
 * Its stylesheet is imported app-wide (that is how the `fm-*` tokens arrive),
 * and its base layer used to restyle every Dashboard page: link hover went
 * translucent, buttons picked up a transition, scrollbars shrank to 5px, and
 * `.prose-sm` list rules beat the typography plugin in the Report and KB views.
 * None of that throws; it just quietly makes other pages look wrong.
 *
 * Each rule below is one the package sets and MUST carry the panel-root
 * selector. A bare `.prose-sm { … }` is fine — that one is the typography
 * plugin's own utility, not the package's list overrides.
 */
const PANEL_ROOT = '.fm-copilot-panel';
const MUST_BE_SCOPED = [
  { name: 'link hover opacity', pattern: /(^|[},])\s*a:hover\s*\{/g },
  { name: 'button transition', pattern: /(^|[},])\s*button\s*\{\s*transition/g },
  { name: 'scrollbar width', pattern: /(^|[},])\s*::-webkit-scrollbar\s*\{/g },
  { name: 'prose-sm list rules', pattern: /(^|[},])\s*\.prose-sm\s+(ul|ol|li)\s*\{/g },
];

const leaked = MUST_BE_SCOPED.filter(({ pattern }) => {
  for (const match of css.matchAll(pattern)) {
    // Scoped occurrences are preceded by the panel root within the same
    // selector; an unscoped one starts the selector list.
    const selectorStart = css.lastIndexOf('}', match.index) + 1;
    if (!css.slice(selectorStart, match.index + match[0].length).includes(PANEL_ROOT)) return true;
  }
  return false;
});

if (leaked.length > 0) {
  for (const { name } of leaked) {
    fail(`the package's "${name}" rule is not scoped to ${PANEL_ROOT} — it restyles every page.`);
  }
  process.exit(1);
}

/**
 * The Dashboard's OWN preflight has to be in the stylesheet.
 *
 * This app used to inherit `@tailwind base` from the package's global sheet.
 * copilot#249 correctly stopped shipping one — a component library has no
 * business resetting its host's document — and the Dashboard was left with no
 * preflight at all. Nothing threw. `body` kept the user agent's 8px margin so
 * every page scrolled 16px, and `box-sizing` fell back to `content-box`, so a
 * `max-w-7xl px-6` main measured 1056px inside a 1008px parent at 1024 wide
 * and overflowed sideways.
 *
 * That is the whole reason this is a gate: a missing reset is invisible to
 * every unit test and to a build, and shows up only as pages quietly coming
 * apart at particular widths.
 *
 * The universal selector matters. `.fm-copilot-panel *` also sets
 * `box-sizing`, and matching that would pass on a build with no preflight at
 * all, so the patterns below are anchored to a rule that starts the selector.
 */
const PREFLIGHT_RULES = [
  {
    name: 'universal box-sizing (Tailwind preflight)',
    pattern: /(^|})\s*\*\s*,\s*::?before\s*,\s*::?after\s*\{[^}]*box-sizing:\s*border-box/,
  },
  {
    name: 'body margin reset (Tailwind preflight)',
    pattern: /(^|})\s*body\s*\{[^}]*margin:\s*0/,
  },
];

const missingPreflight = PREFLIGHT_RULES.filter(({ pattern }) => !pattern.test(css));

if (missingPreflight.length > 0) {
  for (const { name } of missingPreflight) {
    fail(`the built stylesheet has no ${name}.`);
  }
  console.error('');
  console.error("The Dashboard needs its own `@tailwind base` in src/index.css: the");
  console.error('Copilot UI package deliberately ships no global reset, and without one');
  console.error('every page keeps the UA body margin and falls back to content-box.');
  process.exit(1);
}

const missing = SHARED_UI_CLASSES.filter(({ verbatim }) => !css.includes(verbatim));

if (missing.length > 0) {
  for (const { name } of missing) {
    console.error(`FAIL: \`${name}\` is used by @faultmaven/copilot-ui and is not in the built CSS.`);
  }
  console.error('');
  console.error("Tailwind's `content` did not reach the package's sources, so the shared");
  console.error('panel ships unstyled. Check `content` in tailwind.config.cjs — the preset');
  console.error("array is REPLACED, not merged, and the package is a pnpm symlink.");
  process.exit(1);
}

console.log(
  `OK: ${files.length} stylesheet(s) carry preflight, the panel-scoped base rules, ` +
    `and all ${SHARED_UI_CLASSES.length} shared-UI classes checked.`,
);
