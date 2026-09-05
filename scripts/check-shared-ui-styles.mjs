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
  `OK: ${files.length} stylesheet(s) carry all ${SHARED_UI_CLASSES.length} shared-UI classes checked.`,
);
