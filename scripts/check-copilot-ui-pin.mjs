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
 *  5. GENERATOR PARITY — the copilot repository declares the same
 *     `openapi-typescript` version we do. `packageParity` asserts the two
 *     generated clients are BYTE-IDENTICAL, so the generator is as much a part
 *     of the output as the spec is. A minor release landing in one lockfile
 *     first fails that test with a diff nobody authored, while this gate passed
 *     because it compared pin files rather than generated ones. Both repos pin
 *     the generator exactly; this is what keeps the two pins equal.
 *
 * And two ADVISORY reports, which never fail:
 *
 *  - CONTRACT STALENESS. Whether the contract pin has fallen behind the API's
 *    `main`, said out loud for the same reason (3) is: the package pin got a
 *    "here is a decision to take" and the contract pin got silence, which is
 *    how both clients sat on 3.5.0 while the API served 3.7.0 with every check
 *    green. Reporting is not requiring — consent, not currency.
 *  - THE THIRD CLIENT. `faultmaven-slack-agent` pins the same contract and is
 *    outside (4) deliberately: it does not share this bundle, so its pin is not
 *    a correctness property of this build. But "nobody is watching" and "we
 *    decided not to watch" should be distinguishable, so its position is
 *    printed.
 *
 * Reads `GITHUB_TOKEN` when set (CI), and works without it at the
 * unauthenticated rate limit.
 *
 *     node scripts/check-copilot-ui-pin.mjs
 */
import { readFileSync } from 'node:fs';
import { isExactVersion } from './lib/exact-version.mjs';

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

/** A raw file from a repository at a ref, parsed as JSON. */
async function fetchJsonAtRef(repo, ref, filePath) {
  // AUTHENTICATED and retried. raw.githubusercontent is rate-limited per IP and
  // CI shares a pool, so an unauthenticated read is a coin flip that this gate
  // turns into "Unverifiable is not a pass" — reddening every open pull request
  // for a transport blip, on a check that compares a version string.
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(
        `https://raw.githubusercontent.com/${repo}/${ref}/${filePath}`,
        { headers: { ...githubHeaders(), Accept: 'application/vnd.github.raw' } },
      );
      if (response.ok) return JSON.parse(await response.text());
      // 4xx that is not rate limiting is an answer, not a blip.
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
      if (!/^\d{3} /.test(error.message) === false) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw lastError ?? new Error('unreachable');
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

// ---------------------------------------------------------------------------
// 5. Generator parity: byte-identical output needs an identical generator.
// ---------------------------------------------------------------------------

const GENERATOR = 'openapi-typescript';
// `pkg` is already parsed above; two parsers of the same bytes can disagree.
const ourGenerator = pkg.devDependencies?.[GENERATOR];

try {
  const theirPackage = await fetchJsonAtRef(COPILOT_REPO, pinnedSha, 'package.json');
  const theirGenerator = theirPackage.devDependencies?.[GENERATOR];

  if (!ourGenerator || !theirGenerator) {
    fail(
      `Could not read a \`${GENERATOR}\` version from both repositories ` +
        `(here: ${ourGenerator ?? 'absent'}, there: ${theirGenerator ?? 'absent'}).\n` +
        '    `packageParity` compares generated output byte for byte, so an\n' +
        '    unknown generator is an unknown client.',
    );
  } else if (ourGenerator !== theirGenerator) {
    fail(
      `\`${GENERATOR}\` mismatch: this repository pins ${ourGenerator}, ` +
        `${PACKAGE_NAME} at ${pinnedSha.slice(0, 12)} pins ${theirGenerator}.\n` +
        '    The generator is as much a part of the output as the spec is, and\n' +
        '    `packageParity` requires the two clients byte-identical — so a\n' +
        '    release landing in one lockfile first fails it with a diff nobody\n' +
        '    authored. Move whichever is behind.',
    );
  } else if (!isExactVersion(ourGenerator)) {
    // An EXACT-version test, not a `^`/`~` blacklist: `>=7.10.1`, `7.x`, `*`,
    // `latest` and `7.10.1 - 7.11.0` are all ranges too, and all passed a
    // prefix check while being precisely the drift this rule exists to stop.
    fail(
      `\`${GENERATOR}\` is not pinned to an exact version (${ourGenerator}) in either\n` +
        '    repository. Equal ranges are not equal resolutions: the two lockfiles\n' +
        '    can drift apart on the next install and fail `packageParity` with a\n' +
        '    diff nobody authored. Pin exactly, in both.',
    );
  }
} catch (error) {
  fail(
    `Could not read the copilot repository's package.json at ${pinnedSha}: ${error.message}\n` +
      '    Unverifiable is not a pass.',
  );
}

// ---------------------------------------------------------------------------
// Advisory: where this contract pin sits, and where the third client sits.
// ---------------------------------------------------------------------------

const API_REPO = ourContract.repository ?? 'FaultMaven/faultmaven';
const SLACK_REPO = 'FaultMaven/faultmaven-slack-agent';

try {
  // `contract_version.py` (~20 KB), not `openapi.json` (~500 KB): the same
  // fact, 25x cheaper, on a gate that runs on every push — and it makes this
  // script and the hop reporter agree on their source of truth.
  const response = await fetch(
    `https://raw.githubusercontent.com/${API_REPO}/main/faultmaven/api/contract_version.py`,
    { headers: githubHeaders() },
  );
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const served = /API_CONTRACT_VERSION\s*=\s*"([^"]+)"/.exec(await response.text())?.[1];
  if (served && served !== ourContract.contractVersion) {
    console.warn(
      `\nNOTE: the API contract pin is ${ourContract.contractVersion}; ` +
        `${API_REPO}@main serves ${served}.\n` +
        '      Adopt by moving `ref` and `contractVersion` together and regenerating.\n' +
        '      Advisory: the gate enforces CONSENT, not currency — a contract\n' +
        '      reaches this client when this repository says so, never on merge.\n',
    );
  }
} catch (error) {
  console.warn(`\nNOTE: could not read the live contract version (${error.message}); skipping.\n`);
}

try {
  const slack = await fetchJsonAtRef(SLACK_REPO, 'main', 'api-contract.pin.json');
  if (slack?.contractVersion && slack.contractVersion !== ourContract.contractVersion) {
    console.warn(
      `\nNOTE: ${SLACK_REPO} pins contract ${slack.contractVersion}; this repository pins ` +
        `${ourContract.contractVersion}.\n` +
        '      Not a failure and not this build\'s correctness: that client does not\n' +
        '      share this bundle, which is why it is outside the parity rule above.\n' +
        '      Printed so an unadopted contract is visible rather than merely unwatched.\n',
    );
  }
} catch (error) {
  console.warn(`\nNOTE: could not read ${SLACK_REPO}'s contract pin (${error.message}); skipping.\n`);
}

// ---------------------------------------------------------------------------
// Advisory: the hop reporter is duplicated, so say when the copies differ.
// ---------------------------------------------------------------------------

// `report-contract-hop.mjs` exists in both repositories with nothing keeping it
// in sync, and the two had already drifted by a character within the pull
// request that introduced them. The generated API client gets `packageParity`
// asserting byte identity; this gets a note, because a stale copy in the other
// repository is that repository's decision — the same reasoning as staleness
// above. Fixing it in one place and not the other is the failure mode.
try {
  const response = await fetch(
    `https://raw.githubusercontent.com/${COPILOT_REPO}/${COPILOT_BRANCH}/scripts/report-contract-hop.mjs`,
    { headers: githubHeaders() },
  );
  if (response.ok) {
    const theirs = await response.text();
    const ours = readFileSync('scripts/report-contract-hop.mjs', 'utf8');
    if (theirs.trim() !== ours.trim()) {
      console.warn(
        `\nNOTE: scripts/report-contract-hop.mjs differs from ${COPILOT_REPO}@${COPILOT_BRANCH}.\n` +
          '      It is duplicated by hand, so a fix authored once lands once. If this\n' +
          '      pull request changed it, the other repository needs the same change.\n' +
          '      Advisory: which copy is right is not a question this gate can answer.\n',
      );
    }
  }
} catch {
  /* advisory: a read that fails says nothing rather than failing the build */
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
