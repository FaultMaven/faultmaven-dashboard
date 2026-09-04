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

  it('imports only the package entry, never a deep subpath', () => {
    for (const ref of references) {
      expect(ref.specifier, `${ref.file} reaches past the package's supported surface`).toBe(
        PACKAGE,
      );
    }
  });

  it('has exactly one runtime import, and it is the dynamic one in the mount', () => {
    const runtime = references.filter((ref) => !ref.isTypeOnly);

    expect(runtime.map((ref) => ref.file)).toEqual(['../../copilot/CopilotPanelMount.tsx']);
    expect(runtime[0].isDynamic).toBe(true);
  });
});
