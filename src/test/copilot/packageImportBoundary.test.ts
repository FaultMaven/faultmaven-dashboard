import { describe, it, expect } from 'vitest';

/**
 * How this app is allowed to reach the Copilot UI package.
 *
 * Two rules, and each fails silently without a check:
 *
 * 1. THE SUPPORTED SURFACE IS THE PACKAGE ENTRY. Deep subpaths resolve —
 *    `@faultmaven/copilot-ui/lib/state/store` compiles perfectly — but the
 *    package's own design doc names that as reaching past the contract: those
 *    files exist for the extension, which lives in the same repository and can
 *    be updated in the same commit. A Dashboard that reached them would pin
 *    itself to internals the producer is free to move, and the pin would keep
 *    it green until the day it did.
 * 2. EXACTLY ONE RUNTIME IMPORT, AND IT IS DYNAMIC. That is what keeps the
 *    shared UI out of the entry chunk, so nothing of it is fetched or evaluated
 *    before someone is signed in (ADR-016 D3). A single static `import` added
 *    anywhere would undo the code split with nothing red — the panel would
 *    still be behind ProtectedRoute, and every visitor to `/login` would still
 *    download it.
 *
 * Type-only imports are exempt from rule 2 and are erased at build; they are
 * still held to rule 1.
 */

const PACKAGE = '@faultmaven/copilot-ui';

/**
 * Every non-test source under `src/`, as text. Globbed through Vite rather than
 * `node:fs` because this repo ships no `@types/node` (same reason as
 * CopilotEntry.test.tsx).
 */
const sources = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * The non-TypeScript ways in: the stylesheet and the build config.
 *
 * A rule about imports that only reads `.ts` is a rule with two doors left
 * open — `src/index.css` pulls the package's stylesheet and
 * `tailwind.config.cjs` requires its preset, and either could reach a deep
 * path without a single TypeScript file changing.
 */
const nonTsSources = import.meta.glob<string>(
  ['../../index.css', '/tailwind.config.cjs', '/postcss.config.cjs'],
  { query: '?raw', import: 'default', eager: true },
);

/**
 * The package-provided paths that are deliberate exceptions, and why each one
 * cannot come through the entry.
 *
 * "Deep subpath" has to keep meaning "reaching past the contract" rather than
 * "any path with a slash in it" — so each exception is listed with its reason
 * and asserted to be something the package actually ships.
 *
 *  - the STYLESHEET and the PRESET, because an `index.ts` cannot export a file
 *    for a CSS `@import` or a CommonJS `require` to consume;
 *  - the TURN-LABEL rules, for the same reason as the contract and measured
 *    the same way: `turn-label.ts` imports nothing, while the entry would cost
 *    the whole panel. The Dashboard and the panel print turn numbers for the
 *    same case on the same page, so the rules deciding WHICH number have to be
 *    one implementation (faultmaven#1387);
 *  - the CONTRACT, because importing those three values from the ENTRY pulls
 *    the whole package into the eager graph. Measured: it moved the host store,
 *    transport and persistence internals into this app's entry chunk (+200 kB
 *    for every signed-out visitor), which ADR-016 D3 forbids. `contract.ts`
 *    imports nothing, and the same measurement puts it at +196 bytes.
 */
/** The `.ts` exceptions, which must be proven import-free to keep their exemption. */
const EXEMPT_MODULES = ['contract', 'turn-label'] as const;

const DEEP_PATH_EXCEPTIONS = [
  `${PACKAGE}/styles/globals.css`,
  `${PACKAGE}/tailwind-preset.cjs`,
  ...EXEMPT_MODULES.map((m) => `${PACKAGE}/${m}`),
];

/** Which module owns each exempt subpath — one door per subject, asserted. */
const EXEMPT_DOORS: Record<string, string[]> = {
  contract: ['../../copilot/advertisement.ts', '../../copilot/copilotCapability.ts'],
  'turn-label': ['../../lib/cases/turnLabel.ts'],
};

interface Reference {
  file: string;
  statement: string;
  specifier: string;
  isTypeOnly: boolean;
  isDynamic: boolean;
}

/**
 * Anchored on the SPECIFIER, then read backwards to the nearest `import` or
 * `export` keyword.
 *
 * The obvious pattern — one regex spanning keyword to specifier — silently
 * mis-reads a multi-line import block: its lazy gap matcher happily starts at
 * an unrelated `import { useEffect } from 'react'` three lines above and runs
 * on to the first specifier that matches, so a type-only import is reported as
 * a runtime one. That failure was observed here before this was rewritten.
 */
function collectReferences(): Reference[] {
  const refs: Reference[] = [];
  const quoted = new RegExp(
    String.raw`['"](` + PACKAGE.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&') + String.raw`[^'"]*)['"]`,
    'g',
  );

  for (const [file, text] of Object.entries(sources)) {
    for (const match of text.matchAll(quoted)) {
      const before = text.slice(0, match.index);
      const keywordAt = Math.max(before.lastIndexOf('import'), before.lastIndexOf('export'));
      if (keywordAt < 0) continue;
      const lead = before.slice(keywordAt);
      refs.push({
        file,
        statement: `${lead}${match[0]}`,
        specifier: match[1],
        isTypeOnly: /^(?:import|export)\s+type\b/.test(lead),
        isDynamic: /^import\s*\(\s*$/.test(lead),
      });
    }
  }
  return refs;
}

describe('how the Dashboard reaches @faultmaven/copilot-ui', () => {
  const references = collectReferences();

  it('finds the references it is about to judge', () => {
    // Fail closed: with no hits every loop below asserts nothing, so a renamed
    // package or a broken pattern must break this test rather than pass it.
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    expect(references.length).toBeGreaterThan(0);
  });

  it('imports only the package entry, or a documented exception', () => {
    for (const ref of references) {
      expect(
        [PACKAGE, ...DEEP_PATH_EXCEPTIONS],
        `${ref.file} reaches ${ref.specifier}, which is neither the entry nor a documented exception`,
      ).toContain(ref.specifier);
    }
  });

  it('reaches the contract subpath from exactly the two modules that own a subject', () => {
    // It is an exception, not an open door. The rule is ONE RE-EXPORTING MODULE
    // PER SUBJECT, and the list is exact — so the number of files that could
    // accidentally reach the ENTRY instead stays enumerated, which is the thing
    // this actually protects.
    //
    //   advertisement.ts      the panel attribute and the two window messages
    //   copilotCapability.ts  the capability attribute, its tokens, its reader
    //
    // The second door opened when faultmaven-copilot#260 shipped the capability
    // names and `copilotCapabilities()`; this repo had been spelling them out
    // locally while its side landed first. Routing them through
    // `advertisement.ts` instead would have made the capability GATE depend on
    // the module it gates, for no gain — each file is still the single place
    // this app talks about its own half of the handshake.
    const contractRefs = references.filter(
      (ref) => ref.specifier === `${PACKAGE}/contract`,
    );

    expect([...new Set(contractRefs.map((ref) => ref.file))].sort()).toEqual([
      '../../copilot/advertisement.ts',
      '../../copilot/copilotCapability.ts',
    ]);
  });

  it('reaches each exempt subpath from exactly its own door', () => {
    // An exception is not an open door. Without this, any file under `src/`
    // could import the turn-label rules directly — a second, third, fourth
    // door — while `turnLabel.ts` goes on calling itself "the third".
    for (const [module, doors] of Object.entries(EXEMPT_DOORS)) {
      const refs = references.filter((ref) => ref.specifier === `${PACKAGE}/${module}`);
      expect(refs.length, `nothing reaches ${module}`).toBeGreaterThan(0);
      expect([...new Set(refs.map((r) => r.file))].sort()).toEqual([...doors].sort());
    }
  });

  it('keeps each door to its own subject', () => {
    // The file list alone does NOT enforce the split it is justified by:
    // `copilotCapability.ts` could start importing `DASHBOARD_PANEL_MESSAGE` and
    // posting window messages, or `advertisement.ts` could import
    // `CAPABILITY_PANEL_WITHDRAW` and gate on it, and the list would be
    // unchanged. Widening the exception from one file to two without also
    // asserting WHAT each pulls is exactly where an exception becomes the open
    // door the rule above denies it is.
    const subject = {
      '../../copilot/advertisement.ts': /^DASHBOARD_PANEL_|^dashboardAdvertisesPanel$/,
      '../../copilot/copilotCapability.ts': /^COPILOT_|^CAPABILITY_|^copilotCapabilities$|^CopilotCapability$/,
    } as const;

    const contractRefs = references.filter((ref) => ref.specifier === `${PACKAGE}/contract`);
    expect(contractRefs.length).toBeGreaterThan(0);

    for (const ref of contractRefs) {
      const allowed = subject[ref.file as keyof typeof subject];
      expect(allowed, `${ref.file} is not a documented contract door`).toBeDefined();

      // The braces of the statement this reference was read from, split on
      // commas and stripped of `type` markers and aliases.
      const names = (ref.statement.match(/\{([^}]*)\}/)?.[1] ?? '')
        .split(',')
        .map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
        .filter(Boolean);

      expect(names.length, `${ref.file} reaches the contract but names nothing`).toBeGreaterThan(0);
      for (const name of names) {
        expect(
          allowed.test(name),
          `${ref.file} pulls ${name}, which belongs to the other door's subject`,
        ).toBe(true);
      }
    }
  });

  it('reaches the package from CSS and build config only through the two documented assets', () => {
    // Same rule, the other two doors. A stylesheet `@import` and a config
    // `require` are imports; they simply are not TypeScript ones.
    const found: Array<[string, string]> = [];
    for (const [file, text] of Object.entries(nonTsSources)) {
      for (const match of text.matchAll(
        new RegExp(String.raw`['"](` + PACKAGE.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&') + String.raw`[^'"]*)['"]`, 'g'),
      )) {
        found.push([file, match[1]]);
      }
    }

    // Fail closed: with no hits the loop asserts nothing, so a renamed package
    // or a stylesheet that stopped importing the shared one must break this.
    expect(found.length).toBeGreaterThan(0);
    for (const [file, specifier] of found) {
      expect(
        [PACKAGE, ...DEEP_PATH_EXCEPTIONS],
        `${file} reaches ${specifier}, which is neither the entry nor a published asset`,
      ).toContain(specifier);
    }
  });

  it('names each asset exception as something the package actually ships', () => {
    // An exception list that drifted from the package would quietly permit a
    // path that no longer exists — or forbid one that does. Read as text: the
    // preset is CommonJS and the stylesheet is CSS, and neither should be
    // EVALUATED just to prove it is there.
    const shipped = import.meta.glob(
      [
        '/node_modules/@faultmaven/copilot-ui/styles/globals.css',
        '/node_modules/@faultmaven/copilot-ui/tailwind-preset.cjs',
        '/node_modules/@faultmaven/copilot-ui/contract.ts',
        '/node_modules/@faultmaven/copilot-ui/turn-label.ts',
      ],
      { query: '?raw', import: 'default', eager: true },
    );

    // Presence, not content: Vite resolves a `.css` `?raw` glob to an empty
    // string, so a length assertion would fail on a file that is plainly there.
    expect(Object.keys(shipped)).toHaveLength(DEEP_PATH_EXCEPTIONS.length);
  });

  it('keeps the exempt modules dependency-FREE, which is why they are exempt', () => {
    // The exemption rests entirely on this, and the previous version of this
    // test had been weakened into not proving it: a `from "…"` scan misses a
    // bare side-effect import and anything double-quoted, and it checked only
    // the first hop. A module that re-exports an import-free module is
    // import-free; one that re-exports a module which grew an import is not,
    // and the +200 kB would be back with this green.
    const graph = import.meta.glob(
      [
        '/node_modules/@faultmaven/copilot-ui/contract.ts',
        '/node_modules/@faultmaven/copilot-ui/turn-label.ts',
        '/node_modules/@faultmaven/copilot-ui/lib/state/turn-label.ts',
        '/node_modules/@faultmaven/copilot-ui/lib/state/message-kind.ts',
      ],
      { query: '?raw', import: 'default', eager: true },
    );
    const files = Object.entries(graph) as unknown as [string, string][];

    // Fail closed: a renamed or moved module must break this rather than make
    // every assertion below vacuous.
    expect(files.length).toBe(4);

    for (const [file, source] of files) {
      const isDoor = EXEMPT_MODULES.some((m) => file.endsWith(`/${m}.ts`));
      // Every import or re-export specifier, however quoted, plus bare
      // side-effect imports and `require`.
      const specifiers = [
        ...source.matchAll(/(?:^|\s)(?:import|export)\s+[^;]*?from\s*['"]([^'"]+)['"]/g),
        ...source.matchAll(/(?:^|\s)import\s*['"]([^'"]+)['"]/g),
        ...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
      ].map((m) => m[1]);

      for (const s of specifiers) {
        // A DOOR may re-export the import-free state modules asserted here and
        // nothing else. A LEAF must reach nothing at all.
        expect(
          isDoor && /^\.\/lib\/state\/(turn-label|message-kind)$/.test(s),
          `${file} reaches ${s}`,
        ).toBe(true);
      }
    }
  });

  it('has exactly one runtime import of the ENTRY, and it is dynamic', () => {
    // The entry drags the whole package in, so it may only be reached lazily —
    // that is what keeps the shared UI out of the chunk every signed-out
    // visitor downloads. The contract subpath is exempt precisely because it
    // drags nothing (asserted below); it is filtered out here rather than
    // silently widening this rule.
    const runtimeEntry = references.filter(
      (ref) => !ref.isTypeOnly && ref.specifier === PACKAGE,
    );

    expect(runtimeEntry.map((ref) => ref.file)).toEqual(['../../copilot/CopilotPanelMount.tsx']);
    expect(runtimeEntry[0].isDynamic).toBe(true);
  });
});
