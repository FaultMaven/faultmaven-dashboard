/**
 * The Dashboard's Tailwind config: the shared FaultMaven theme, plus the few
 * tokens only this app has.
 *
 * ADR-003 is one design system, and until faultmaven-dashboard#120 the two
 * frontends hand-maintained near-copies of it — which had already drifted
 * (`fm-bg`, `fm-accent-strong`, `font-fm-sans` and `font-fm-mono` were used by
 * the Copilot UI and simply absent here, and a missing Tailwind token throws
 * nothing: the class is never emitted and the element renders unstyled). The
 * tokens now ship WITH the UI that uses them, as a preset, so there is one
 * definition and no copy to drift.
 *
 * What stays local is only what the shared UI has no notion of: the Dashboard's
 * wider type scale, its breakpoints, the ADR-003 "candidate" border width and
 * the typography plugin the read-only tabs render markdown through.
 *
 * `content` is ours because only this app knows where its files are — and the
 * package's own glob has to be in the list (the preset supplies it, and this
 * adds the installed path explicitly) or every `fm-*` class the shared UI uses
 * is purged out of the bundle.
 */
const copilotUiPreset = require('@faultmaven/copilot-ui/tailwind-preset.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [copilotUiPreset],
  /*
   * `content` is the ONE key Tailwind does not merge across presets — a
   * config's array REPLACES the preset's — so the package's own globs have to
   * be spread in by hand. Omit them and every `fm-*` class the shared UI uses
   * is purged: no error, no warning, just a panel rendered unstyled.
   *
   * Spread rather than hand-written, so this tracks wherever the package says
   * its sources are (it resolves them from its own `__dirname`, which is inside
   * pnpm's store) instead of a path in this repo that happens to work today.
   * The explicit glob below stays as well: it is broader than the preset's
   * `shared/` + `lib/`, and `scripts/check-shared-ui-styles.mjs` is what proves
   * the whole arrangement actually emits.
   */
  content: [
    './src/**/*.{js,ts,jsx,tsx,html}',
    './node_modules/@faultmaven/copilot-ui/**/*.{js,ts,jsx,tsx}',
    ...copilotUiPreset.content,
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
            'pre code': {
              backgroundColor: 'transparent',
              padding: 0,
              borderRadius: 0,
            },
          },
        },
      },

      screens: {
        'xs': '400px',
        'sm': '500px',
        'md': '700px',
      },

      /* Dashboard-only extension of the shared compact scale. */
      fontSize: {
        "fm-subhead": ["18px", { lineHeight: "1.4" }],
        "fm-heading": ["24px", { lineHeight: "1.3" }],
        "fm-display": ["32px", { lineHeight: "1.2" }],
      },

      /* ADR-003: "Candidate" visual treatment - dashed border for unreviewed AI suggestions */
      borderWidth: {
        'candidate': '2px',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
