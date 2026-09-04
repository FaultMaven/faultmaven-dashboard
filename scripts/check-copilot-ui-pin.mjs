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
 *  3. STALENESS — ADVISORY ONLY, never a failure. Whether the pin has fallen
 *     behind is worth saying out loud, but it is not a property of THIS pull
 *     request: copilot's main moves on its own, so failing on it would redden
 *     every open Dashboard PR the moment someone merged there, and would forbid
 *     developing the two repositories together. Adoption is a decision, and a
 *     red check is not how you ask for one. A pin-bump PR is.
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

/** The copilot repository's own API-contract pin, at a given commit. */
async function fetchPinnedContract(sha) {
  const response = await fetch(
    `https://raw.githubusercontent.com/${COPILOT_REPO}/${sha}/api-contract.pin.json`,
    { headers: { 'User-Agent': 'faultmaven-dashboard-copilot-ui-pin-check' } },
  );
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return JSON.parse(await response.text());
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

// Both network reads at once: neither needs the other, and this gate runs on
// every push.
const [comparisonResult, contractResult] = await Promise.allSettled([
  getJson(`https://api.github.com/repos/${COPILOT_REPO}/compare/${pinnedSha}...${COPILOT_BRANCH}`),
  fetchPinnedContract(pinnedSha),
]);

if (comparisonResult.status === 'rejected') {
  fail(
    `Could not compare ${pinnedSha} with ${COPILOT_REPO}@${COPILOT_BRANCH}: ` +
      `${comparisonResult.reason.message}\n` +
      '    Unverifiable is not a pass — this gate reports on a pin it could not read.',
  );
  report();
}
const comparison = comparisonResult.value;

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

// Narrowed to the package path: nothing else in that repository is this
// repository's business, and the whole-diff view was both noisier and subject
// to GitHub's 300-file truncation.
const changedInPackage = (comparison.files ?? []).filter((file) =>
  (file.filename ?? '').startsWith(PACKAGE_SUBTREE),
);

if (changedInPackage.length > 0) {
  const commits = (comparison.commits ?? []).slice(-5).reverse();
  console.warn(
    `\nNOTE: ${changedInPackage.length} file(s) under ${PACKAGE_SUBTREE} have changed on ` +
      `${COPILOT_BRANCH} since ${pinnedSha.slice(0, 12)}.\n` +
      commits
        .map((c) => `      ${c.sha.slice(0, 12)} ${c.commit.message.split('\n')[0]}`)
        .join('\n') +
      `\n      Adopt by moving the SHA in package.json and re-running \`pnpm install\`.` +
      `\n      Advisory: staleness is a decision to take, not a reason to fail this PR.\n`,
  );
}

// ---------------------------------------------------------------------------
// 4. Pin parity: one API contract across both clients in this bundle.
// ---------------------------------------------------------------------------

const ourContract = JSON.parse(readFileSync('api-contract.pin.json', 'utf8'));

if (contractResult.status === 'rejected') {
  fail(
    `Could not read the copilot repository's api-contract.pin.json at ${pinnedSha}: ` +
      `${contractResult.reason.message}\n    Unverifiable is not a pass.`,
  );
  report();
}
const theirContract = contractResult.value;

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
