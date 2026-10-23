#!/usr/bin/env node
/**
 * The image builds on the Node and pnpm package.json declares.
 *
 * package.json is the single source (faultmaven#2163): `engines.node` names
 * the Node major and `packageManager` the exact pnpm. Every workflow job that
 * sets up Node, and pnpm where it uses pnpm, does it through FaultMaven/ci-actions
 * `setup-js`, which reads them there; Vercel reads `engines.node` directly, and
 * the Dockerfile installs `packageManager`. The
 * Dockerfile's `FROM node:<tag>` is the one consumer that cannot read the
 * file, so this gate holds it to `engines.node`. Without it, CI would test on
 * one Node while the shipped image is built on another.
 *
 * Run from the repository root:
 *     node scripts/check-toolchain-pins.mjs
 *
 * A file that cannot be read or parsed, or a Dockerfile with no `FROM node:`,
 * is a failure: a gate that compared nothing must not report a pass.
 */
import { readFileSync } from 'node:fs';
import { fail, finish } from './gate-support.mjs';

let failures = 0;
const problem = (message) => {
  fail(message);
  failures += 1;
};

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    problem(`cannot read ${path}: ${error.message}`);
    return null;
  }
}

let pkg = {};
const pkgText = read('package.json');
if (pkgText !== null) {
  try {
    pkg = JSON.parse(pkgText);
  } catch (error) {
    problem(`cannot parse package.json: ${error.message}`);
  }
}

const engine = /^(\d+)\.x$/.exec(String(pkg.engines?.node ?? ''));
if (!engine) {
  problem(`package.json engines.node is ${JSON.stringify(pkg.engines?.node)}; expected a major such as "24.x".`);
}
if (!/^pnpm@\d+\.\d+\.\d+$/.test(String(pkg.packageManager ?? ''))) {
  problem(`package.json packageManager is ${JSON.stringify(pkg.packageManager)}; expected an exact "pnpm@X.Y.Z".`);
}

const dockerfile = read('Dockerfile');
if (dockerfile !== null) {
  // Instructions only: a comment that names a version is not an instruction.
  const code = dockerfile
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  // `node`, from any registry or namespace (`docker.io/library/node`), by tag,
  // by digest or bare (implicitly `latest`, which names no major and fails). A
  // stage FROM some other image is not a Node stage.
  const froms = [...code.matchAll(/^\s*FROM\s+(?:--platform=\S+\s+)?(?:[\w.-]+(?::\d+)?\/)*node((?:[:@]\S+)?)(?=\s|$)/gim)].map((m) => m[1]);
  if (froms.length === 0) {
    problem('the Dockerfile has no `FROM node:<tag>` line, so nothing was compared.');
  }
  for (const ref of froms) {
    const major = /^:(\d+)(?:[.-]|@|$)/.exec(ref)?.[1];
    if (engine && major !== engine[1]) {
      problem(`the Dockerfile builds FROM node${ref}, but package.json engines.node is ${engine[1]}.x.`);
    }
  }
  if (!/require\(\s*['"]\.\/package\.json['"]\s*\)\.packageManager/.test(code)) {
    problem("the Dockerfile does not install the pnpm package.json's packageManager names.");
  }
  if (/pnpm@\d/.test(code)) {
    problem('the Dockerfile installs a literal pnpm version; install the one package.json packageManager names.');
  }
}

finish(failures, `the Dockerfile builds on Node ${engine?.[1]} with ${pkg.packageManager}, as package.json declares.`);
