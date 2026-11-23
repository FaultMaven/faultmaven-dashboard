#!/usr/bin/env node
/**
 * The built bundle's copilot-ui errors keep their names (faultmaven#2341).
 *
 * The shared UI tells its errors apart by `name` as well as `instanceof`, and
 * this app's build minifies class names: a name derived from the class read
 * `"xv"` in a shipped bundle. copilot-ui names each class by literal since
 * faultmaven-copilot#414. Its tests run unminified source, so only the built
 * bundle can show the literal survived.
 *
 * For each probed class, some class in `dist/` must set its own `name` to that
 * literal, and set it to nothing else. A class missing from the bundle fails:
 * that is the probe gone blind, or a copilot-ui from before #414.
 *
 * Run AFTER `pnpm build`:
 *     pnpm build && node scripts/check-error-identity.mjs
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { collectBuildOutputOrExit, fail, finish } from './gate-support.mjs';

/** Error classes the panel bundles, quoted nowhere in copilot-ui before #414. */
const PROBED = ['DuplicateUploadNotice', 'TurnReplayUnavailableError'];

/** The value a node gives the class's own `name`: a `name` field or a `this.name =`. */
function nameValue(node) {
  if (ts.isPropertyDeclaration(node) && node.name.getText() === 'name') return node.initializer;
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.left) &&
    node.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
    node.left.name.text === 'name'
  ) {
    return node.right;
  }
  return undefined;
}

/** For each derived class in `code`, the values its own members give `name`, as text. */
function derivedClassNames(code) {
  const file = ts.createSourceFile('chunk.js', code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const classes = [];
  const visit = (node) => {
    if (ts.isClassLike(node) && node.heritageClauses) {
      const values = [];
      // Not into a nested class: the name has to be this class's own.
      const collect = (n) => {
        const value = nameValue(n);
        if (value) values.push(ts.isStringLiteral(value) ? value.text : value.getText(file));
        if (!ts.isClassLike(n)) ts.forEachChild(n, collect);
      };
      node.members.forEach(collect);
      if (values.length > 0) classes.push(values);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return classes;
}

const sources = collectBuildOutputOrExit('dist', ['.js'], 'this gate').map((f) => readFileSync(f, 'utf8'));
const named = sources.filter((code) => PROBED.some((p) => code.includes(p))).flatMap(derivedClassNames);
let failures = 0;
for (const literal of PROBED) {
  const mine = named.filter((values) => values.includes(literal));
  if (mine.length === 0) {
    fail(`no class in dist/ names itself ${JSON.stringify(literal)}: nothing was probed, which is not a pass.`);
    failures += 1;
  }
  for (const values of mine.filter((v) => v.some((value) => value !== literal))) {
    fail(`the class naming itself ${JSON.stringify(literal)} also sets name to ${values.join(', ')}.`);
    failures += 1;
  }
}
finish(failures, `${PROBED.join(' and ')} keep their names in the built bundle.`);
