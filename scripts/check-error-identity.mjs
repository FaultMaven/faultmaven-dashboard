#!/usr/bin/env node
/**
 * The built bundle's copilot-ui errors keep their names (faultmaven#2341).
 *
 * copilot-ui tells its errors apart by `name` as well as `instanceof`, and
 * this app's build minifies class names: a name derived from the class read
 * `"xv"` in a shipped bundle. copilot-ui names each class by literal since
 * faultmaven-copilot#414. Its tests run unminified source, so only the built
 * bundle can show the literal survived.
 *
 * For each probed class, some copilot-ui error class in `dist/` (one whose own
 * instance members set `userTitle`, as each probed copilot-ui class does and
 * none of this app's errors do) must set its own `name` to that literal, and set it to
 * nothing else. A class missing from the bundle fails: that is the probe gone
 * blind, or a copilot-ui from before #414.
 *
 * Run AFTER `pnpm build`:
 *     pnpm build && node scripts/check-error-identity.mjs
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { collectBuildOutputOrExit, fail, finish } from './gate-support.mjs';

/** Every class copilot-ui compares by `name` (at copilot-ui 7d22249e), and where. */
const COMPARED = {
  AuthenticationError: 'lib/errors/classifier.ts, lib/utils/api-error-handler.ts, lib/api/services/case-service.ts',
  SessionExpiredError: 'lib/api/client.ts, lib/api/services/case-service.ts',
  NetworkError: 'lib/errors/classifier.ts, lib/utils/api-error-handler.ts, lib/utils/retry.ts',
  TimeoutError: 'lib/errors/classifier.ts, lib/api/client.ts, lib/utils/retry.ts, lib/utils/keyed-turn-retry.ts',
  ValidationError: 'lib/errors/classifier.ts',
  RateLimitError: 'shared/ui/components/ConversationsList.tsx',
};
/** Two classes no copilot-ui file quotes before #414: present only from it on. */
const ADDED_BY_414 = ['DuplicateUploadNotice', 'TurnReplayUnavailableError'];
const PROBED = [...Object.keys(COMPARED), ...ADDED_BY_414];

const isStatic = (member) =>
  ts.canHaveModifiers(member) && !!ts.getModifiers(member)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
/** A boundary for `this`: a nested non-arrow function, or a class. */
const rebindsThis = (node) =>
  ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassLike(node);

/** The instance property a node sets, with its value: a field, or `this.<prop> =`. */
function assignment(node) {
  if (ts.isPropertyDeclaration(node) && node.initializer) return [node.name.getText(), node.initializer];
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.left) &&
    node.left.expression.kind === ts.SyntaxKind.ThisKeyword
  ) {
    return [node.left.name.text, node.right];
  }
  return undefined;
}

/** For each derived class in `code`, the instance properties its own members set: prop -> values. */
function derivedClassProps(code) {
  const file = ts.createSourceFile('chunk.js', code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const classes = [];
  const visit = (node) => {
    if (ts.isClassLike(node) && node.heritageClauses) {
      const props = new Map();
      const collect = (n) => {
        const found = assignment(n);
        if (found) {
          const [prop, value] = found;
          props.set(prop, [...(props.get(prop) ?? []), ts.isStringLiteral(value) ? value.text : value.getText(file)]);
        }
        ts.forEachChild(n, (child) => (rebindsThis(child) ? undefined : collect(child)));
      };
      node.members.filter((m) => !isStatic(m)).forEach(collect);
      if (props.size > 0) classes.push(props);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return classes;
}

const sources = collectBuildOutputOrExit('dist', ['.js'], 'this gate').map((f) => readFileSync(f, 'utf8'));
const copilotErrors = sources
  .filter((code) => code.includes('userTitle'))
  .flatMap(derivedClassProps)
  .filter((props) => props.has('userTitle') && props.has('name'));
let failures = 0;
for (const literal of PROBED) {
  const mine = copilotErrors.filter((props) => props.get('name').includes(literal));
  if (mine.length === 0) {
    fail(`no copilot-ui error class in dist/ names itself ${JSON.stringify(literal)}: nothing was probed, which is not a pass.`);
    failures += 1;
  }
  for (const props of mine.filter((p) => p.get('name').some((value) => value !== literal))) {
    fail(`the class naming itself ${JSON.stringify(literal)} also sets name to ${props.get('name').join(', ')}.`);
    failures += 1;
  }
}
finish(failures, `${PROBED.length} copilot-ui error classes keep their names in the built bundle: ${PROBED.join(', ')}.`);
