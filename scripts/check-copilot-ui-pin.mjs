#!/usr/bin/env node
/**
 * The Copilot UI pin: is it still on `main`, is it still current, and is it
 * typed against the same API contract this repository is?
 *
 * A PIN MAKES A CONSUMER STABLE, NOT CURRENT. Under a SHA pin the Dashboard can
 * sit six months behind `@faultmaven/copilot-ui` with every check green — which
 * is the original divergence (ADR-016 D2) wearing a pin. Adopting is moving the
 * pin; refusing to adopt has to be an explicit, reviewed act rather than
 * silence, and that is what this gate turns it into.
 *
 * Four assertions, and each fails for a different reason:
 *
 *  1. PIN SHAPE — package.json names the package at a 40-character SHA, and
 *     pnpm-lock.yaml records the SAME one. A lockfile that resolved something
 *     else is a build that ships something nobody reviewed.
 *  2. ANCESTRY — the pinned commit is on the copilot repository's `main`. A pin
 *     at an unmerged branch commit is not adoptable: it can be rebased away or
 *     never merged, and the tarball it resolves would then describe a revision
 *     that does not exist in the producer's history.
 *  3. STALENESS — nothing under `packages/copilot-ui` differs between the pin
 *     and `main`. This is the assertion the pin itself removes and the one this
 *     file mostly exists for.
 *  4. PIN PARITY — the copilot repository's `api-contract.pin.json` AT THE
 *     PINNED SHA matches this repository's. The two regenerate-and-diff jobs are
 *     the CORRECTNESS leg (each client matches the contract it pinned); this is
 *     the CONSISTENCY leg. Without it one bundle can hold two clients typed
 *     against two contract versions, and structural typing means most of that
 *     compiles. Both legs are needed: correctness alone allows the two to be
 *     pinned at different contracts, and consistency alone allows N copies to be
 *     wrong together.
 *
 * Reads `GITHUB_TOKEN` when set (CI), and works without it at the
 * unauthenticated rate limit.
 *
 *     node scripts/check-copilot-ui-pin.mjs
 */
import { readFileSync } from 'node:fs';

const PACKAGE_NAME = '@faultmaven/copilot-ui';
const COPILOT_REPO = 'FaultMaven/faultmaven-copilot';
const COPILOT_BRANCH = 'main';
const PACKAGE_SUBTREE = 'packages/copilot-ui/';

/** GitHub caps a comparison's `files` at this many, with no pagination. */
const COMPARE_FILES_CAP = 300;

const failures = [];
function fail(message) {
  failures.push(message);
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'faultmaven-dashboard-copilot-ui-pin-check',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function getJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// 1. Pin shape: package.json and the lockfile must name the same commit.
// ---------------------------------------------------------------------------

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const specifier = pkg.dependencies?.[PACKAGE_NAME] ?? pkg.devDependencies?.[PACKAGE_NAME];

if (!specifier) {
  fail(`package.json does not depend on ${PACKAGE_NAME}. Nothing to check; that is not a pass.`);
  report();
}

const shaMatch = /#([0-9a-f]{40})\b/.exec(specifier);
if (!shaMatch) {
  fail(
    `${PACKAGE_NAME} is not pinned to a 40-character commit SHA: ${JSON.stringify(specifier)}.\n` +
      '    A tag or a branch is not a pin — it moves under the lockfile.',
  );
  report();
}
const pinnedSha = shaMatch[1];

const lockfile = readFileSync('pnpm-lock.yaml', 'utf8');
const lockedShas = new Set(
  [...lockfile.matchAll(/faultmaven-copilot\/tar\.gz\/([0-9a-f]{40})/g)].map((m) => m[1]),
);
if (lockedShas.size === 0) {
  fail('pnpm-lock.yaml records no copilot tarball. Run `pnpm install` and commit the lockfile.');
} else if (lockedShas.size > 1 || !lockedShas.has(pinnedSha)) {
  fail(
    `pnpm-lock.yaml resolves ${[...lockedShas].join(', ')} but package.json pins ${pinnedSha}.\n` +
      '    The build would ship a revision the manifest does not name.',
  );
}

// ---------------------------------------------------------------------------
// 2 & 3. Ancestry and staleness, from one comparison.
// ---------------------------------------------------------------------------

let comparison;
try {
  comparison = await getJson(
    `https://api.github.com/repos/${COPILOT_REPO}/compare/${pinnedSha}...${COPILOT_BRANCH}`,
  );
} catch (error) {
  fail(
    `Could not compare ${pinnedSha} with ${COPILOT_REPO}@${COPILOT_BRANCH}: ${error.message}\n` +
      '    Unverifiable is not a pass — this gate reports on a pin it could not read.',
  );
  report();
}

// `<pin>...main`: "ahead" means MAIN is ahead of the pin, i.e. the pin is an
// ancestor. "behind" and "diverged" both mean the pin is not on main.
if (comparison.status === 'behind' || comparison.status === 'diverged') {
  fail(
    `The pinned commit ${pinnedSha} is not on ${COPILOT_REPO}@${COPILOT_BRANCH} ` +
      `(comparison status: ${comparison.status}).\n` +
      '    Pin a merged commit: an unmerged one can be rebased away, and the tarball\n' +
      '    would then name a revision the producer no longer has.',
  );
}

const changedInPackage = (comparison.files ?? []).filter((file) =>
  (file.filename ?? '').startsWith(PACKAGE_SUBTREE),
);

if (changedInPackage.length > 0) {
  const commits = (comparison.commits ?? []).slice(-10).reverse();
  fail(
    `The pin has fallen behind: ${changedInPackage.length} file(s) under ${PACKAGE_SUBTREE} ` +
      `differ between ${pinnedSha.slice(0, 12)} and ${COPILOT_BRANCH}.\n` +
      changedInPackage
        .slice(0, 15)
        .map((f) => `      ${f.status.padEnd(9)} ${f.filename}`)
        .join('\n') +
      (changedInPackage.length > 15 ? `\n      … ${changedInPackage.length - 15} more` : '') +
      '\n    Most recent commits in the gap:\n' +
      commits
        .map((c) => `      ${c.sha.slice(0, 12)} ${c.commit.message.split('\n')[0]}`)
        .join('\n') +
      `\n    Adopt by moving the SHA in package.json and re-running \`pnpm install\`.`,
  );
} else if ((comparison.files ?? []).length >= COMPARE_FILES_CAP) {
  // GitHub truncates `files` at 300 with no pagination. A clean result from a
  // truncated list proves nothing about the files it dropped.
  fail(
    `The comparison with ${COPILOT_BRANCH} was truncated at ${COMPARE_FILES_CAP} files, so ` +
      `"nothing under ${PACKAGE_SUBTREE} changed" cannot be established.\n` +
      '    The pin is far enough behind that it should be moved regardless.',
  );
}

// ---------------------------------------------------------------------------
// 4. Pin parity: one API contract across both clients in this bundle.
// ---------------------------------------------------------------------------

const ourContract = JSON.parse(readFileSync('api-contract.pin.json', 'utf8'));

let theirContract;
try {
  const response = await fetch(
    `https://raw.githubusercontent.com/${COPILOT_REPO}/${pinnedSha}/api-contract.pin.json`,
    { headers: { 'User-Agent': 'faultmaven-dashboard-copilot-ui-pin-check' } },
  );
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  theirContract = JSON.parse(await response.text());
} catch (error) {
  fail(
    `Could not read the copilot repository's api-contract.pin.json at ${pinnedSha}: ${error.message}\n` +
      '    Unverifiable is not a pass.',
  );
  report();
}

for (const field of ['repository', 'ref', 'contractVersion']) {
  if (ourContract[field] !== theirContract[field]) {
    fail(
      `API contract pin mismatch on \`${field}\`: this repository says ` +
        `${JSON.stringify(ourContract[field])}, ${PACKAGE_NAME} at ${pinnedSha.slice(0, 12)} says ` +
        `${JSON.stringify(theirContract[field])}.\n` +
        '    One bundle would hold two API clients typed against two contracts, and\n' +
        '    structural typing means most of that compiles. Move whichever pin is behind.',
    );
  }
}

report();

function report() {
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure}`);
      console.error('');
    }
    process.exit(1);
  }
  console.log(
    `OK: ${PACKAGE_NAME} pinned at ${pinnedSha.slice(0, 12)} — on ${COPILOT_BRANCH}, ` +
      `current with ${PACKAGE_SUBTREE}, and pinned to the same API contract ` +
      `(${ourContract.contractVersion} @ ${ourContract.ref.slice(0, 12)}).`,
  );
  process.exit(0);
}
