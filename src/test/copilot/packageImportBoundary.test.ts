import { describe, it, expect } from 'vitest';
import ts from 'typescript';

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
 * Every non-test source under `src/`, as text, globbed through Vite.
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
 *  - the MERMAID SITE CONFIG, for the same reason again: `mermaid-config.ts`
 *    imports only mermaid's config TYPE, which is erased. mermaid's site config
 *    is one global and the last initializer wins whole, so this app's diagrams
 *    and the embedded panel's must initialize from one object (faultmaven#2119);
 *  - the CONTRACT, because importing those three values from the ENTRY pulls
 *    the whole package into the eager graph. Measured: it moved the host store,
 *    transport and persistence internals into this app's entry chunk (+200 kB
 *    for every signed-out visitor), which ADR-016 D3 forbids. `contract.ts`
 *    imports nothing, and the same measurement puts it at +196 bytes.
 */
/** The `.ts` exceptions, which must be proven import-free to keep their exemption. */
const EXEMPT_MODULES = ['contract', 'turn-label', 'mermaid-config'] as const;

const DEEP_PATH_EXCEPTIONS = [
  `${PACKAGE}/styles/globals.css`,
  `${PACKAGE}/tailwind-preset.cjs`,
  ...EXEMPT_MODULES.map((m) => `${PACKAGE}/${m}`),
];

/** Which module owns each exempt subpath — one door per subject, asserted. */
const EXEMPT_DOORS: Record<string, string[]> = {
  contract: ['../../copilot/advertisement.ts', '../../copilot/copilotCapability.ts'],
  'turn-label': ['../../lib/cases/turnLabel.ts'],
  'mermaid-config': ['../../components/MermaidDiagram.tsx'],
};

interface ModuleReference {
  /** The module named, or `<computed>` for an `import()` / `require()` of an expression. */
  specifier: string;
  /** `import()`: the only reference that leaves its module out of the importer's chunk. */
  isDynamic: boolean;
  /** What a declaration takes: imported or re-exported names, `default`, `*`. */
  names: string[];
}

function specifierOf(node: ts.Node | undefined): string {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : '<computed>';
}

function namesOf(node: ts.ImportDeclaration | ts.ExportDeclaration): string[] {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    const bindings = clause?.namedBindings;
    return [
      ...(clause?.name ? ['default'] : []),
      ...(bindings && ts.isNamespaceImport(bindings) ? ['*'] : []),
      ...(bindings && ts.isNamedImports(bindings)
        ? bindings.elements.map((e) => (e.propertyName ?? e.name).text)
        : []),
    ];
  }
  const clause = node.exportClause;
  return clause && ts.isNamedExports(clause)
    ? clause.elements.map((e) => (e.propertyName ?? e.name).text)
    : ['*'];
}

/**
 * Every module a parsed file names: import and export-from declarations,
 * `import x = require()`, `import()` and `require()` calls, and `import('…')`
 * types. Walked, not scanned: a comment or a string cannot pass for syntax.
 */
function moduleReferences(file: ts.SourceFile): ModuleReference[] {
  const found: ModuleReference[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)) {
      found.push({ specifier: specifierOf(node.moduleSpecifier), isDynamic: false, names: namesOf(node) });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      found.push({ specifier: specifierOf(node.moduleReference.expression), isDynamic: false, names: ['default'] });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      found.push({ specifier: specifierOf(node.arguments[0]), isDynamic, names: [] });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      found.push({ specifier: specifierOf(node.argument.literal), isDynamic: false, names: [] });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Every module the SOURCE names, type-only included: rule 1 holds those too. */
function sourceReferences(code: string, fileName: string): ModuleReference[] {
  return moduleReferences(ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true));
}

/**
 * Every module the EMITTED code reaches. TypeScript does the erasing, not a
 * pattern: under `verbatimModuleSyntax` it drops exactly what is written as a
 * type (`import type …`, `export type …`) and keeps everything else, so no
 * reference is credited with an elision another compiler setting might skip.
 */
function runtimeReferences(code: string, fileName = 'module.ts'): ModuleReference[] {
  // A declaration file emits nothing (and transpileModule cannot emit one).
  if (fileName.endsWith('.d.ts')) return [];
  const emitted = ts.transpileModule(code, {
    fileName,
    compilerOptions: {
      verbatimModuleSyntax: true,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      jsx: ts.JsxEmit.Preserve,
    },
  }).outputText;
  return sourceReferences(emitted, fileName.replace(/\.ts$/, '.js').replace(/\.tsx$/, '.jsx'));
}

const runtimeSpecifiers = (code: string, fileName?: string): string[] =>
  runtimeReferences(code, fileName).map((r) => r.specifier);

interface Reference extends ModuleReference {
  file: string;
}

const isPackage = (specifier: string): boolean =>
  specifier === PACKAGE || specifier.startsWith(`${PACKAGE}/`);

/**
 * The references to the package, read by `read`, from each file whose PARSED
 * source names it: raw text misses an escaped specifier the compiler resolves.
 */
function collectReferences(
  read: (code: string, fileName: string) => ModuleReference[],
  files: Record<string, string> = sources,
): Reference[] {
  const refs: Reference[] = [];
  for (const [file, text] of Object.entries(files)) {
    if (!sourceReferences(text, file).some((ref) => isPackage(ref.specifier))) continue;
    for (const ref of read(text, file)) {
      if (isPackage(ref.specifier)) refs.push({ file, ...ref });
    }
  }
  return refs;
}

/** The runtime references to the ENTRY: ADR-016 D3 allows exactly one, dynamic. */
function runtimeEntryReferences(files: Record<string, string> = sources): Reference[] {
  return collectReferences(runtimeReferences, files).filter((ref) => ref.specifier === PACKAGE);
}

describe('how the Dashboard reaches @faultmaven/copilot-ui', () => {
  const references = collectReferences(sourceReferences);

  it('finds the references it is about to judge', () => {
    // Fail closed: with no hits every loop below asserts nothing, so a renamed
    // package or a broken reader must break this test rather than pass it.
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
    // Every exempt module has its doors listed, or it would have none checked.
    expect(Object.keys(EXEMPT_DOORS).sort()).toEqual([...EXEMPT_MODULES].sort());
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

      // The names the declaration takes from the contract, before any alias.
      const { names } = ref;

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
        '/node_modules/@faultmaven/copilot-ui/mermaid-config.ts',
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
        '/node_modules/@faultmaven/copilot-ui/mermaid-config.ts',
        '/node_modules/@faultmaven/copilot-ui/lib/state/turn-label.ts',
        '/node_modules/@faultmaven/copilot-ui/lib/state/message-kind.ts',
      ],
      { query: '?raw', import: 'default', eager: true },
    );
    const files = Object.entries(graph) as unknown as [string, string][];

    // Fail closed: a renamed or moved module must break this rather than make
    // every assertion below vacuous.
    expect(files.length).toBe(5);

    for (const [file, source] of files) {
      const isDoor = EXEMPT_MODULES.some((m) => file.endsWith(`/${m}.ts`));
      for (const s of runtimeSpecifiers(source, file)) {
        // A DOOR may re-export the import-free state modules asserted here and
        // nothing else. A LEAF must reach nothing at all.
        expect(
          isDoor && /^\.\/lib\/state\/(turn-label|message-kind)$/.test(s),
          `${file} reaches ${s}`,
        ).toBe(true);
      }
    }
  });

  it('skips only the imports the compiler erases', () => {
    // `mermaid-config.ts` imports mermaid's config TYPE; anything that survives
    // to runtime must still be caught, or the exemption above proves nothing.
    for (const erased of [
      "import type { A } from 'mermaid';\nexport const x: A = {} as A;",
      "export type { A } from 'mermaid';",
      "export type * from 'mermaid';",
      "import type * as M from 'mermaid';\nexport const x: M.A = {} as M.A;",
    ]) {
      expect(runtimeSpecifiers(erased), erased).toEqual([]);
    }
    for (const runtime of [
      "import { A } from 'mermaid';",
      "import { type A, b } from 'mermaid';",
      "import { type A } from 'mermaid';", // emitted as `import {} from 'mermaid'`
      "import type from 'mermaid';\nexport const x = type;", // a default binding named `type`
      "import type , { a } from 'mermaid';\nexport const x = [type, a];",
      "import 'mermaid';",
      "const m = require('mermaid');",
      'export const f = () => import(`mermaid`);',
      "// import type notes\nimport { A } from 'mermaid';",
      // A comment INSIDE the clause is still a comment (review F1).
      "import { a /* import type */ } from 'mermaid';\nexport const x = a;",
      "import {\n  a, // was: import type { A }\n  b,\n} from 'mermaid';\nexport const x = [a, b];",
      "export { a, // was: export type { A }\n} from 'mermaid';",
    ]) {
      expect(runtimeSpecifiers(runtime), runtime).toEqual(['mermaid']);
    }
    expect(runtimeSpecifiers('declare const name: string;\nexport const m = require(name);')).toEqual([
      '<computed>',
    ]);
  });

  it('counts a static ENTRY import as runtime, whatever its comments say', () => {
    // Review F2: the one-dynamic-import rule below read the same comments.
    const probe = "import { PANEL_ROOT_CLASS /* import type */ } from '@faultmaven/copilot-ui';\nexport const c = PANEL_ROOT_CLASS;";
    const entry = runtimeEntryReferences({ ...sources, '../../probe.ts': probe });
    expect(entry.map((ref) => ref.file)).not.toEqual(['../../copilot/CopilotPanelMount.tsx']);
    expect(entry).toContainEqual(expect.objectContaining({ file: '../../probe.ts', isDynamic: false }));
    // A type-only import of the entry is erased, and stays out of the rule.
    const typeOnly = "import type { HostUser } from '@faultmaven/copilot-ui';\nexport type U = HostUser;";
    expect(runtimeEntryReferences({ '../../probe.ts': typeOnly })).toEqual([]);
  });

  it('reads an escaped ENTRY specifier, and a declaration file, the way the compiler does', () => {
    // Delta finding 2: a file was chosen by raw text, so `\u0040…` was never read.
    const escaped = "import { PANEL_ROOT_CLASS } from '\\u0040faultmaven/copilot-ui';\nexport const c = PANEL_ROOT_CLASS;";
    const entry = runtimeEntryReferences({ ...sources, '../../escaped.ts': escaped });
    expect(entry.map((ref) => ref.file)).not.toEqual(['../../copilot/CopilotPanelMount.tsx']);
    expect(entry).toContainEqual(expect.objectContaining({ file: '../../escaped.ts', isDynamic: false }));
    // Delta finding 1: a declaration file emits nothing, so it adds no runtime reference.
    const declaration =
      "import type { HostUser } from '@faultmaven/copilot-ui';\ndeclare global { interface Window { fmProbeUser?: HostUser } }\nexport {};";
    expect(runtimeReferences(declaration, 'probe.d.ts')).toEqual([]);
    const withDeclaration = runtimeEntryReferences({ ...sources, '../../types/probe.d.ts': declaration });
    expect(withDeclaration.map((ref) => [ref.file, ref.isDynamic])).toEqual([
      ['../../copilot/CopilotPanelMount.tsx', true],
    ]);
  });

  it('has exactly one runtime import of the ENTRY, and it is dynamic', () => {
    // The entry drags the whole package in, so it may only be reached lazily —
    // that is what keeps the shared UI out of the chunk every signed-out
    // visitor downloads. The contract subpath is exempt precisely because it
    // drags nothing (asserted below); it is filtered out here rather than
    // silently widening this rule.
    const runtimeEntry = runtimeEntryReferences();

    expect(runtimeEntry.map((ref) => ref.file)).toEqual(['../../copilot/CopilotPanelMount.tsx']);
    expect(runtimeEntry[0].isDynamic).toBe(true);
  });
});
