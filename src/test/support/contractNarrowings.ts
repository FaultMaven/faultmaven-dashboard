import ts from 'typescript';

/**
 * Find every type in the app that NARROWS the generated contract, by parsing
 * the TypeScript AST.
 *
 * ‼ THIS WAS REGEXES, AND THE REGEXES KEPT BEING WRONG IN THE SAME WAY. Three
 * review rounds on #174 each found more spellings the sweep could not see, all
 * of them ordinary: `Pick<components['schemas']['X'], …>` (the sweep demanded a
 * bare identifier), a declaration wrapped after the `=` (the head had to be on
 * one line), a member whose type is an inline object (parsed line-wise, so its
 * nested keys were reported as members of the parent), and a narrowing reached
 * through a schema alias imported from another file. Each was measured with an
 * unguarded probe that kept every test green.
 *
 * A regex cannot be made to read TypeScript, so this does not try. The compiler
 * is already a devDependency; `createSourceFile` is a parse only — no program,
 * no type checker, no `tsconfig` resolution — so it costs milliseconds per file
 * and cannot drift from the language the way a pattern does.
 */

export type Narrowing =
  | { kind: 'whole'; file: string; local: string; wire: string }
  | { kind: 'member'; file: string; local: string; wire: string; key: string; type: string; optional: boolean }
  | { kind: 'subset'; file: string; local: string; wire: string; wireRef: string };

/** A `components['schemas']['X']` indexed access → `X`. */
const schemaFromIndexedAccess = (node: ts.TypeNode): string | undefined => {
  if (!ts.isIndexedAccessTypeNode(node)) return undefined;
  const outer = node.objectType;
  if (!ts.isIndexedAccessTypeNode(outer)) return undefined;
  const root = outer.objectType;
  if (!(ts.isTypeReferenceNode(root) && root.typeName.getText() === 'components')) return undefined;
  if (!ts.isLiteralTypeNode(outer.indexType) || !ts.isStringLiteral(outer.indexType.literal)) return undefined;
  if (outer.indexType.literal.text !== 'schemas') return undefined;
  if (!ts.isLiteralTypeNode(node.indexType) || !ts.isStringLiteral(node.indexType.literal)) return undefined;
  return node.indexType.literal.text;
};

/** `Name<...>` → its name, or undefined. */
const typeRefName = (node: ts.TypeNode): string | undefined =>
  ts.isTypeReferenceNode(node) ? node.typeName.getText() : undefined;

type Parsed = { file: string; sf: ts.SourceFile; aliases: Map<string, string>; imports: Map<string, string> };

const parseAll = (sources: Record<string, string>): Parsed[] =>
  Object.entries(sources).map(([file, text]) => {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const aliases = new Map<string, string>();
    const imports = new Map<string, string>();
    for (const st of sf.statements) {
      if (ts.isTypeAliasDeclaration(st)) {
        const schema = schemaFromIndexedAccess(st.type);
        if (schema) aliases.set(st.name.text, schema);
      }
      // ‼ Imported schema aliases resolve too. A module spelling
      // `import type { KBDocument } from './knowledge/types'` and then
      // `Omit<KBDocument, 'title'> & { … }` is an ordinary narrowing, and the
      // file-local-only version of this could not see it — measured, two
      // unguarded narrowings in that shape kept every test green.
      if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
        const from = st.moduleSpecifier.text;
        const named = st.importClause?.namedBindings;
        if (named && ts.isNamedImports(named)) {
          for (const el of named.elements) imports.set(el.name.text, from);
        }
      }
    }
    return { file, sf, aliases, imports };
  });

/** Resolve a module specifier against the importing file, to a `sources` key. */
const resolveModule = (fromFile: string, spec: string, keys: Set<string>): string | undefined => {
  if (!spec.startsWith('.')) return undefined;
  const dir = fromFile.split('/').slice(0, -1);
  for (const part of spec.split('/')) {
    if (part === '.') continue;
    else if (part === '..') dir.pop();
    else dir.push(part);
  }
  const base = dir.join('/');
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((c) => keys.has(c));
};

/**
 * A type node → the contract schema it ultimately names, following local and
 * imported aliases (one hop, which is how every alias in the tree is spelled).
 */
const resolveSchema = (
  node: ts.TypeNode,
  self: Parsed,
  all: Map<string, Parsed>
): string | undefined => {
  const direct = schemaFromIndexedAccess(node);
  if (direct) return direct;
  const name = typeRefName(node);
  if (!name) return undefined;
  if (self.aliases.has(name)) return self.aliases.get(name);
  const spec = self.imports.get(name);
  if (!spec) return undefined;
  const target = resolveModule(self.file, spec, new Set(all.keys()));
  return target ? all.get(target)?.aliases.get(name) : undefined;
};

export function findNarrowings(sources: Record<string, string>): Narrowing[] {
  const parsed = parseAll(sources);
  const byFile = new Map(parsed.map((p) => [p.file, p]));
  const out: Narrowing[] = [];

  for (const p of parsed) {
    for (const st of p.sf.statements) {
      if (!ts.isTypeAliasDeclaration(st)) continue;
      const local = st.name.text;
      const t = st.type;

      // `Pick<Wire, …>` — a read model. Bare `Pick<X>` OR
      // `Pick<components['schemas']['X'], …>`; the regex only ever saw the first.
      if (typeRefName(t) === 'Pick' && ts.isTypeReferenceNode(t) && t.typeArguments?.length) {
        const wire = resolveSchema(t.typeArguments[0], p, byFile);
        if (wire) {
          out.push({ kind: 'subset', file: p.file, local, wire, wireRef: t.typeArguments[0].getText() });
        }
        continue;
      }

      if (!ts.isIntersectionTypeNode(t)) continue;
      const omit = t.types.find((m) => typeRefName(m) === 'Omit');
      const literal = t.types.find(ts.isTypeLiteralNode);

      // ‼ `Omit<…>` ONLY counts inside an intersection that overrides a key.
      // A pure subtraction alias (`type X = Omit<Wire, 'title'>`) is NOT a
      // narrowing, and demanding a `GuardNarrowing` for it was a dead end:
      // measured, no such guard compiles, because a subtraction is not a
      // subtype of what it subtracts from.
      if (omit && literal && ts.isTypeReferenceNode(omit) && omit.typeArguments?.length) {
        const wire = resolveSchema(omit.typeArguments[0], p, byFile);
        if (wire) out.push({ kind: 'whole', file: p.file, local, wire });
        continue;
      }

      // `Wire & { k?: N }` — narrowing one member in place.
      const schemaArm = t.types.find((m) => resolveSchema(m, p, byFile));
      if (schemaArm && literal) {
        const wire = resolveSchema(schemaArm, p, byFile)!;
        // ‼ Only the literal's OWN properties. A line-wise parse reported the
        // keys of an inline nested object as members of the parent, and then
        // demanded a guard naming a key the wire does not have.
        for (const m of literal.members) {
          if (!ts.isPropertySignature(m) || !m.type || !ts.isIdentifier(m.name)) continue;
          out.push({
            kind: 'member',
            file: p.file,
            local,
            wire,
            key: m.name.text,
            type: m.type.getText(),
            optional: m.questionToken !== undefined,
          });
        }
      }
    }
  }
  return out;
}

/** Every `GuardX<A, B, …>` reference in a file, as resolved argument text. */
export function findGuardCalls(sources: Record<string, string>): {
  file: string;
  guard: string;
  args: string[];
}[] {
  const out: { file: string; guard: string; args: string[] }[] = [];
  for (const [file, text] of Object.entries(sources)) {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isTypeReferenceNode(node)) {
        const name = node.typeName.getText();
        if (name.startsWith('Guard') && node.typeArguments) {
          out.push({
            file,
            guard: name,
            args: node.typeArguments.map((a) => a.getText().replace(/\s+/g, ' ')),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}
