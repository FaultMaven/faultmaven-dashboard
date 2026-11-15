#!/usr/bin/env node
/**
 * THE PINS ARE BEHIND — said where someone will see it.
 *
 * The Dashboard pins `@faultmaven/copilot-ui` to a copilot commit and the API
 * contract to a core commit. Neither moves on its own: adopting is a pin-bump
 * pull request, and refusing to adopt is a decision. The PR gate
 * (`check-copilot-ui-pin.mjs`) deliberately never FAILS on staleness, because
 * copilot's and core's `main` move on their own and a red check on every open
 * pull request is not how to ask for a decision. But its advisory went to one
 * place, a NOTE line in the log of a green job, and the pins sat a week and
 * thirteen contract versions behind (a MAJOR among them) with nobody asked.
 *
 * So this runs daily on `main` and keeps ONE open issue, labelled
 * `pin-staleness`, in step with the pins:
 *
 *   - behind, no open issue   → opens one;
 *   - behind, an open issue   → rewrites its title and body to today's state;
 *   - current, an open issue  → comments that the pins caught up and closes it;
 *   - current, no open issue  → nothing.
 *
 * It opens an issue, not a pull request. A copilot-ui bump that crosses a
 * contract change must also move `api-contract.pin.json` to copilot's contract
 * at the new commit (pin parity), regenerate the types and adapt the code that
 * reads them. A bot pull request would arrive red more often than not; the
 * issue says what adopting involves and leaves the decision where it belongs.
 *
 * A read that fails exits 1 BEFORE the issue is touched: a run that could not
 * see the pins must neither open an issue nor close one. With `--dry-run`
 * (the pull_request trigger) it prints the planned action and the body and
 * writes nothing.
 *
 *     GITHUB_TOKEN=… node scripts/report-pin-staleness.mjs [--dry-run]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPILOT_BRANCH, COPILOT_REPO, PACKAGE_SUBTREE, packageChanges } from './lib/pin-staleness.mjs';

export const ISSUE_LABEL = 'pin-staleness';
const DEFAULT_REPO = 'FaultMaven/faultmaven-dashboard';
const PACKAGE_NAME = '@faultmaven/copilot-ui';
/** Commit subjects listed in the body; the compare link has the rest. */
const COMMITS_LISTED = 10;
/** GitHub's compare API returns at most this many files. */
const COMPARE_FILE_CAP = 300;

/** `3.7.0` → `[3, 7, 0]`, or null: ordering is numeric, never lexical. */
function parseVersion(version) {
  const parts = String(version ?? '').split('.').map((n) => Number.parseInt(n, 10));
  return parts.length === 3 && parts.every(Number.isInteger) ? parts : null;
}

const compareVersions = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * The contract entries above `from` and at or below `to`, newest first, as
 * `{ version, level, title }`. Titles only: the bodies of a dozen entries
 * would outgrow an issue, and the adopting pull request prints them in full
 * (`report-contract-hop.mjs`). Null when either version does not parse.
 */
export function contractEntriesBetween(entries, from, to) {
  const lo = parseVersion(from);
  const hi = parseVersion(to);
  if (!lo || !hi) return null;
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({ entry, version: parseVersion(entry?.version) }))
    .filter(({ version }) => version && compareVersions(version, lo) > 0 && compareVersions(version, hi) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
    .map(({ entry }) => ({ version: entry.version, level: entry.level, title: entry.title }));
}

const short = (sha) => String(sha).slice(0, 12);
const oneLine = (text) => String(text ?? '').split('\n')[0].replace(/\s+/g, ' ').trim();

/**
 * Whether the pins are behind, and the issue that says so.
 *
 * @param pinnedSha            the copilot commit `package.json` pins
 * @param comparison           GitHub `compare/<pinnedSha>...main` on the copilot repository
 * @param ourContract          this repository's `api-contract.pin.json`
 * @param servedContract       the contract version core's `main` serves
 * @param copilotMainContract  copilot's `api-contract.pin.json` at its `main`
 * @param notes                core's `contract-notes.json` at `main` (null if unread)
 */
export function describeStaleness({ pinnedSha, comparison, ourContract, servedContract, copilotMainContract, notes }) {
  const changed = packageChanges(comparison);
  const packageBehind = changed.length > 0;
  const contractBehind = servedContract !== ourContract.contractVersion;
  if (!packageBehind && !contractBehind) return { stale: false, title: '', body: '' };

  const commitCount = comparison?.ahead_by ?? (comparison?.commits ?? []).length;
  const fileCount = changed.length >= COMPARE_FILE_CAP ? `${COMPARE_FILE_CAP}+` : String(changed.length);
  const crossed = contractBehind ? contractEntriesBetween(notes?.entries, ourContract.contractVersion, servedContract) : [];
  const majors = (crossed ?? []).filter((entry) => entry.level === 'MAJOR');

  const titleParts = [];
  if (packageBehind) titleParts.push(`copilot-ui ${commitCount} commit${commitCount === 1 ? '' : 's'} behind`);
  if (contractBehind) {
    titleParts.push(
      `contract ${ourContract.contractVersion} → ${servedContract}` + (majors.length > 0 ? ' (includes MAJOR)' : ''),
    );
  }
  const title = `Pins behind: ${titleParts.join('; ')}`;

  const sections = [
    'The Dashboard pins have fallen behind. Nothing reaches this repository until a pin-bump pull request ' +
      'moves them; this issue asks for that decision. It is kept current by the daily Pin Staleness workflow ' +
      '(`scripts/report-pin-staleness.mjs`) and closed by it once the pins catch up.',
  ];

  if (packageBehind) {
    const commits = (comparison?.commits ?? []).slice(-COMMITS_LISTED).reverse();
    sections.push(
      `### \`${PACKAGE_NAME}\`\n\n` +
        `Pinned at \`${short(pinnedSha)}\`. \`${COPILOT_REPO}@${COPILOT_BRANCH}\` is ${commitCount} commit(s) ahead, ` +
        `and ${fileCount} file(s) under \`${PACKAGE_SUBTREE}\` changed ` +
        `([compare](https://github.com/${COPILOT_REPO}/compare/${pinnedSha}...${COPILOT_BRANCH})).\n\n` +
        (commits.length > 0
          ? `Latest commits:\n\n${commits.map((c) => `- \`${short(c.sha)}\` ${oneLine(c.commit?.message)}`).join('\n')}\n`
          : ''),
    );
  }

  if (contractBehind) {
    let listing;
    if (crossed === null) {
      listing = 'The two versions do not parse as `x.y.z`, so what lies between them is unlisted. Check by hand.';
    } else if (!Array.isArray(notes?.entries)) {
      listing = "Core's contract notes could not be read, so what lies between is unlisted. Check by hand.";
    } else if (crossed.length === 0) {
      listing = 'No contract entries matched, though the notes were read. Check by hand.';
    } else {
      listing = crossed.map((entry) => `- **${entry.version}** ${entry.level}: ${oneLine(entry.title)}`).join('\n');
    }
    sections.push(
      `### API contract\n\n` +
        `Pinned at **${ourContract.contractVersion}**; core's \`main\` serves **${servedContract}**.` +
        (majors.length > 0 ? ` ⚠️ ${majors.length} MAJOR change(s) in between.` : '') +
        `\n\n${listing}\n`,
    );
  }

  const copilotContract = copilotMainContract?.contractVersion;
  sections.push(
    '### Adopting\n\n' +
      (packageBehind && copilotContract && copilotContract !== ourContract.contractVersion
        ? `Moving \`${PACKAGE_NAME}\` to copilot's \`main\` also moves the contract pin to **${copilotContract}** ` +
          '(the required pin-parity check), so the bump regenerates the API types and adapts the code that reads them.\n\n'
        : '') +
      '- copilot-ui: move the SHA in `package.json`, then `pnpm install`.\n' +
      '- contract: move `ref` and `contractVersion` in `api-contract.pin.json` together, then regenerate the types.\n' +
      '- The adopting pull request prints every contract it crosses in full (`report-contract-hop.mjs`).\n',
  );

  return { stale: true, title, body: sections.map((section) => section.trimEnd()).join('\n\n') + '\n' };
}

/**
 * What to do with the open `pin-staleness` issues, given today's report.
 * Acts on the oldest open one; any others are duplicates and close against it.
 */
export function planIssueAction(openIssues, report) {
  const open = [...openIssues].sort((a, b) => a.number - b.number);
  const [keep, ...duplicates] = open;
  if (!report.stale) {
    return open.length > 0 ? { kind: 'close', numbers: open.map((issue) => issue.number) } : { kind: 'none' };
  }
  if (!keep) return { kind: 'create', duplicates: [] };
  const unchanged = keep.title === report.title && (keep.body ?? '') === report.body;
  return {
    kind: unchanged ? 'none' : 'update',
    number: keep.number,
    duplicates: duplicates.map((issue) => issue.number),
  };
}

function githubHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'faultmaven-dashboard-pin-staleness',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * One run, with its I/O injected so the whole flow is testable: `fetchImpl` is
 * `fetch`, `readFile` reads a repository file, `log` prints.
 */
export async function run({ fetchImpl = fetch, readFile, env = process.env, dryRun = false, log = console.log }) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  const repo = env.GITHUB_REPOSITORY || DEFAULT_REPO;
  const headers = githubHeaders(token);

  async function api(method, url, body) {
    const response = await fetchImpl(url.startsWith('http') ? url : `https://api.github.com${url}`, {
      method,
      headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const error = new Error(`${method} ${url}: ${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  const raw = (repoName, ref, file) =>
    api('GET', `/repos/${repoName}/contents/${file}?ref=${encodeURIComponent(ref)}`).then((meta) =>
      JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8')),
    );

  // Every read first. Any failure throws here, before an issue is touched.
  const pkg = JSON.parse(readFile('package.json'));
  const specifier = pkg.dependencies?.[PACKAGE_NAME] ?? pkg.devDependencies?.[PACKAGE_NAME] ?? '';
  const pinnedSha = /#([0-9a-f]{40})\b/.exec(specifier)?.[1];
  if (!pinnedSha) throw new Error(`${PACKAGE_NAME} is not pinned to a 40-character SHA in package.json`);
  const ourContract = JSON.parse(readFile('api-contract.pin.json'));
  const apiRepo = ourContract.repository ?? 'FaultMaven/faultmaven';

  const [comparison, notes, copilotMainContract, openIssues] = await Promise.all([
    api('GET', `/repos/${COPILOT_REPO}/compare/${pinnedSha}...${COPILOT_BRANCH}`),
    raw(apiRepo, 'main', 'docs/reference/api/contract-notes.json'),
    raw(COPILOT_REPO, COPILOT_BRANCH, 'api-contract.pin.json'),
    api('GET', `/repos/${repo}/issues?labels=${ISSUE_LABEL}&state=open&per_page=100`),
  ]);
  const servedContract = notes?.contractVersion;
  if (typeof servedContract !== 'string') throw new Error("core's contract-notes.json names no contractVersion");

  const report = describeStaleness({ pinnedSha, comparison, ourContract, servedContract, copilotMainContract, notes });
  const issues = openIssues.filter((issue) => !issue.pull_request);
  const plan = planIssueAction(issues, report);

  log(report.stale ? report.title : 'Pins are current.');
  log(`Planned action: ${plan.kind}${plan.number ? ` #${plan.number}` : ''}${plan.numbers ? ` #${plan.numbers.join(', #')}` : ''}`);
  if (dryRun) {
    if (report.stale) log(`\n${report.body}`);
    return plan;
  }

  if (plan.kind === 'close') {
    for (const number of plan.numbers) {
      await api('POST', `/repos/${repo}/issues/${number}/comments`, {
        body:
          `The pins are current: \`${PACKAGE_NAME}\` at \`${short(pinnedSha)}\` and contract ` +
          `${ourContract.contractVersion}. Closed by the Pin Staleness workflow.`,
      });
      await api('PATCH', `/repos/${repo}/issues/${number}`, { state: 'closed', state_reason: 'completed' });
    }
    return plan;
  }

  let number = plan.number;
  if (plan.kind === 'create') {
    try {
      await api('POST', `/repos/${repo}/labels`, {
        name: ISSUE_LABEL,
        color: 'fbca04',
        description: 'A Dashboard pin (copilot-ui or API contract) is behind its source',
      });
    } catch (error) {
      if (error.status !== 422) throw error; // 422: the label exists already.
    }
    number = (await api('POST', `/repos/${repo}/issues`, { title: report.title, body: report.body, labels: [ISSUE_LABEL] }))
      .number;
    log(`Opened #${number}.`);
  } else if (plan.kind === 'update') {
    await api('PATCH', `/repos/${repo}/issues/${number}`, { title: report.title, body: report.body });
    log(`Updated #${number}.`);
  }
  for (const duplicate of plan.duplicates ?? []) {
    await api('POST', `/repos/${repo}/issues/${duplicate}/comments`, { body: `Duplicate of #${number}.` });
    await api('PATCH', `/repos/${repo}/issues/${duplicate}`, { state: 'closed', state_reason: 'not_planned' });
  }
  return plan;
}

// `import.meta.main` is not available on every Node this repo supports.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  run({
    readFile: (file) => readFileSync(path.join(root, file), 'utf8'),
    dryRun: process.argv.includes('--dry-run'),
  }).catch((error) => {
    console.error(`FAIL: ${error.message}\n    The pins could not be read, so no issue was opened, updated or closed.`);
    process.exit(1);
  });
}
