/**
 * The pieces every build-output gate needs, in one place.
 *
 * Each gate had its own copy of "collect files, refuse to pass on an empty
 * set" — and that refusal is the part that matters most: a gate which scanned
 * nothing and reported success is worse than no gate, because it is a green
 * tick standing in for an unasked question.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Print a failure. Callers accumulate, then `finish()`. */
export function fail(message) {
  console.error(`FAIL: ${message}`);
}

/** Every file under `dir` whose name ends in one of `suffixes`. */
export function collectFiles(dir, suffixes) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (suffixes.some((s) => entry.endsWith(s))) out.push(path);
    }
  };
  walk(dir);
  return out;
}

/**
 * Collect files, or exit non-zero explaining why nothing could be scanned.
 *
 * Both failure states are the GATE's, not the subject's: a missing `dist/`
 * means nobody built, and an empty one means the build produced nothing. Either
 * way the gate has compared nothing and must not say "pass".
 */
export function collectBuildOutputOrExit(dir, suffixes, label) {
  let files;
  try {
    files = collectFiles(dir, suffixes);
  } catch {
    fail(`No ${dir}/ to inspect. Run \`pnpm build\` first — ${label} reports on the built bundle.`);
    process.exit(1);
  }
  if (files.length === 0) {
    fail(`${dir}/ holds no ${suffixes.join('/')} files. Nothing was scanned; that is not a pass.`);
    process.exit(1);
  }
  return files;
}

/** Read and concatenate, for a whole-bundle text search. */
export function readAll(files) {
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}

/** Exit 1 if anything failed, else print `okMessage` and exit 0. */
export function finish(failures, okMessage) {
  if (failures > 0) process.exit(1);
  console.log(`OK: ${okMessage}`);
  process.exit(0);
}
