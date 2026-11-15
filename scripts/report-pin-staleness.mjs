#!/usr/bin/env node
/**
 * THE PINS ARE BEHIND — said where someone will see it.
 *
 * The Dashboard bundles `@faultmaven/copilot-ui`, pinned to a copilot commit,
 * and pins the API contract its own client is typed against. Neither moves on
 * its own: adopting is a pin-bump pull request, and refusing to adopt is a
 * decision. The PR gate (`check-copilot-ui-pin.mjs`) deliberately never FAILS
 * on staleness, because copilot's and core's `main` move on their own and a
 * red check on every open pull request is not how to ask for a decision. But
 * its advisory went to one place, a NOTE line in the log of a green job, and
 * the pins sat a week and a dozen contract versions behind (a MAJOR among
 * them) with nobody asked.
 *
 * So this runs daily on `main` and keeps ONE open issue, labelled
 * `pin-staleness`, in step with the pins:
 *
 *   - behind, no open issue   → opens one;
 *   - behind, an open issue   → rewrites its title and body to today's state;
 *   - current, an open issue  → closes it and says so;
 *   - current, no open issue  → nothing.
 *
 * BEHIND WHAT: copilot's `main`, for both pins. The Dashboard cannot adopt a
 * contract copilot-ui has not: the required pin-parity check holds this
 * repository's contract pin equal to copilot's at the pinned commit. So the
 * adoptable target is copilot `main`'s package AND its contract pin, moved in
 * one pull request. Core serving a newer contract than copilot has adopted is
 * copilot's step first; the issue mentions it and does not count it, or it
 * would ask for a bump the gate refuses and never close.
 *
 * A REFUSAL HOLDS. Closing the issue as "not planned" records a decision not
 * to adopt now. While the state is the one refused (the same title), the run
 * opens nothing; once copilot moves, the title changes and a new issue asks
 * about the new state.
 *
 * It opens an issue, not a pull request: adopting regenerates the API types
 * and adapts the code that reads them, so a bot pull request would arrive red
 * more often than not.
 *
 * A read that fails exits 1 BEFORE the issue is touched: a run that could not
 * see the pins must neither open an issue nor close one. Reads retry a
 * transient failure (429, 5xx, a dropped connection); writes do not, so a
 * retried POST can never open two issues. With `--dry-run` it prints the
 * planned action and the body and writes nothing.
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
/**
 * Contract entries listed in the body. Each is one line of up to ~900
 * characters, and GitHub refuses an issue body over 65,536: an uncapped list
 * would fail every run once the pins fell far enough behind, which is exactly
 * when the issue matters most.
 */
const CONTRACT_ENTRIES_LISTED = 20;
/** GitHub's compare API returns at most this many files, across the whole repository. */
const COMPARE_FILE_CAP = 300;
/** ...and at most this many commits. */
const COMPARE_COMMIT_CAP = 250;
/** One page of the package's commit history; a full page reads as "N+". */
const PACKAGE_COMMITS_PAGE = 100;
const READ_ATTEMPTS = 3;

/** `3.7.0` → `[3, 7, 0]`, or null: ordering is numeric, never lexical. */
function parseVersion(version) {
  const parts = String(version ?? '').split('.').map((n) => Number.parseInt(n, 10));
  return parts.length === 3 && parts.every(Number.isInteger) ? parts : null;
}

const compareVersions = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Whether `target` is a NEWER contract than `pinned`. A pin ahead of its
 * target (an early adoption, a revert) is not behind. Versions that do not
 * parse count as behind when they differ, so the issue asks a human to look.
 */
export function contractIsBehind(pinned, target) {
  const lo = parseVersion(pinned);
  const hi = parseVersion(target);
  if (!lo || !hi) return pinned !== target;
  return compareVersions(hi, lo) > 0;
}

/**
 * The contract entries above `from` and at or below `to`, newest first, as
 * `{ version, level, title }`. Titles only: the adopting pull request prints
 * every body in full (`report-contract-hop.mjs`). Null when either version
 * does not parse.
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

/** "and 7 older entries, 1 of them MAJOR": what the capped listing leaves out. */
function olderEntries(rest) {
  const majors = rest.filter((entry) => entry.level === 'MAJOR').length;
  return (
    `and ${rest.length} older entr${rest.length === 1 ? 'y' : 'ies'}` +
    (majors > 0 ? `, ${majors} of them MAJOR` : '') +
    ' (the adopting pull request lists them all)'
  );
}

const short = (sha) => String(sha).slice(0, 12);
const oneLine = (text) => String(text ?? '').split('\n')[0].replace(/\s+/g, ' ').trim();

/**
 * Text from another repository, shown literally. Copilot's commit subjects end
 * in `(#412)` and core's contract titles cite `#2806`; written plainly into a
 * Dashboard issue, GitHub links those to THIS repository's #412 (an unrelated
 * item, which then shows "mentioned this") and notifies any `@name`. A code
 * span renders neither. Double backticks, because the text has single ones.
 */
const literal = (text) => `\`\` ${oneLine(text).replace(/``+/g, '`')} \`\``;

/**
 * The commits of copilot `main` since the pin that touch the package, newest
 * first, from the package's commit history (`history`, the commits API with
 * `path` and an inclusive `since` at the pin's date).
 *
 * `since` is a timestamp, so it also returns commits that share the pin's
 * second (a rebase-merged batch commits together) and, for a pin that is not
 * an ancestor of main, the merge base. When the comparison lists every commit
 * ahead, only those count; when it is capped, the pin and the merge base are
 * dropped and the rest are taken as they come. Nothing counts when main is
 * not ahead of the pin.
 */
export function packageCommitsSincePin({ history, comparison, pinnedSha }) {
  const aheadBy = comparison?.ahead_by ?? 0;
  if (aheadBy <= 0) return [];
  const listed = comparison?.commits ?? [];
  const complete = listed.length >= aheadBy && listed.length < COMPARE_COMMIT_CAP;
  if (complete) {
    const ahead = new Set(listed.map((commit) => commit.sha));
    return history.filter((commit) => ahead.has(commit.sha));
  }
  const excluded = new Set([pinnedSha, comparison?.merge_base_commit?.sha]);
  return history.filter((commit) => !excluded.has(commit.sha));
}

/**
 * Whether the pins are behind copilot `main`, and the issue that says so.
 *
 * @param pinnedSha        the copilot commit `package.json` pins
 * @param comparison       GitHub `compare/<pinnedSha>...main` on the copilot repository
 * @param packageCommits   `packageCommitsSincePin`, newest first
 * @param ourContract      this repository's `api-contract.pin.json`
 * @param copilotContract  copilot's `api-contract.pin.json` at its `main`: the contract target
 * @param servedContract   the contract version core's `main` serves (context only)
 * @param notes            core's `contract-notes.json` at `main` (null if unread)
 */
export function describeStaleness({
  pinnedSha,
  comparison,
  packageCommits = [],
  ourContract,
  copilotContract,
  servedContract,
  notes,
}) {
  const aheadBy = comparison?.ahead_by ?? 0;
  const changed = packageChanges(comparison);
  // The compare API lists at most 300 files for the whole repository, so a
  // big change elsewhere can push every package file off the list. The
  // package's own history is the second signal, and a truncated list with
  // commits ahead is read as behind, never as current: reading it as current
  // would close the issue on a pin that is behind.
  const truncated = (comparison?.files ?? []).length >= COMPARE_FILE_CAP;
  const packageBehind = aheadBy > 0 && (changed.length > 0 || packageCommits.length > 0 || truncated);
  const target = copilotContract?.contractVersion;
  const contractBehind = contractIsBehind(ourContract.contractVersion, target);
  if (!packageBehind && !contractBehind) return { stale: false, title: '', body: '' };

  const fileCount = truncated ? `at least ${changed.length}` : String(changed.length);
  const commitCount =
    packageCommits.length >= PACKAGE_COMMITS_PAGE ? `${PACKAGE_COMMITS_PAGE}+` : String(packageCommits.length);
  const crossed = contractBehind ? contractEntriesBetween(notes?.entries, ourContract.contractVersion, target) : [];
  const majors = (crossed ?? []).filter((entry) => entry.level === 'MAJOR');

  // Counted in package commits and contract versions: the extension's own
  // commits are not in this bundle, and counting them would rewrite the issue
  // on every copilot merge.
  const titleParts = [];
  if (packageBehind) {
    titleParts.push(
      packageCommits.length > 0
        ? `copilot-ui ${commitCount} package commit${commitCount === '1' ? '' : 's'}`
        : 'copilot-ui',
    );
  }
  if (contractBehind) {
    titleParts.push(`contract ${ourContract.contractVersion} → ${target}` + (majors.length > 0 ? ' (includes MAJOR)' : ''));
  }
  const title = `Pins behind copilot main: ${titleParts.join('; ')}`;

  const sections = [
    "The Dashboard's pins have fallen behind copilot's `main`. Nothing reaches this repository until a pin-bump " +
      'pull request moves them; this issue asks for that decision. The daily Pin Staleness workflow ' +
      '(`scripts/report-pin-staleness.mjs`) keeps it current and closes it once the pins catch up. ' +
      'Closing it as **not planned** records a decision not to adopt now; it stays closed until copilot moves again.',
  ];

  if (packageBehind) {
    const commits = packageCommits.slice(0, COMMITS_LISTED);
    const what =
      packageCommits.length > 0
        ? `${commitCount} commit(s) on \`${COPILOT_BRANCH}\` since then touch \`${PACKAGE_SUBTREE}\`, ` +
          `where ${fileCount} file(s) changed`
        : `${fileCount} file(s) under \`${PACKAGE_SUBTREE}\` changed on \`${COPILOT_BRANCH}\` since then`;
    sections.push(
      `### \`${PACKAGE_NAME}\`\n\n` +
        `Pinned at \`${short(pinnedSha)}\`. ${what} ` +
        `([compare](https://github.com/${COPILOT_REPO}/compare/${pinnedSha}...${COPILOT_BRANCH})).\n\n` +
        (commits.length > 0
          ? `Latest commits touching the package:\n\n` +
            `${commits.map((c) => `- \`${short(c.sha)}\` ${literal(c.commit?.message)}`).join('\n')}\n`
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
      const shown = crossed.slice(0, CONTRACT_ENTRIES_LISTED);
      listing =
        shown.map((entry) => `- **${entry.version}** ${entry.level}: ${literal(entry.title)}`).join('\n') +
        (crossed.length > shown.length ? `\n- … ${olderEntries(crossed.slice(shown.length))}` : '');
    }
    sections.push(
      `### API contract\n\n` +
        `Pinned at **${ourContract.contractVersion}**; copilot's \`${COPILOT_BRANCH}\` pins **${target}**.` +
        (majors.length > 0 ? ` ⚠️ ${majors.length} MAJOR change(s) in between.` : '') +
        `\n\n${listing}\n`,
    );
  }

  // Context, not a count: the Dashboard cannot pass copilot (pin parity).
  if (typeof servedContract === 'string' && target && contractIsBehind(target, servedContract)) {
    sections.push(
      `Core's \`main\` serves **${servedContract}**, which copilot has not adopted yet. The Dashboard reaches it ` +
        "only after copilot does: the pin-parity check holds this repository's contract pin to copilot's.",
    );
  }

  sections.push(
    '### Adopting\n\n' +
      'One pull request moves both pins, because the pin-parity check requires them to agree:\n\n' +
      `- \`${PACKAGE_NAME}\`: move the SHA in \`package.json\` to copilot's \`${COPILOT_BRANCH}\`, then \`pnpm install\`.\n` +
      "- contract: set `ref` and `contractVersion` in `api-contract.pin.json` to copilot's at that commit, then " +
      'regenerate the types and adapt the code that reads them.\n' +
      '- The pull request prints every contract it crosses in full (`report-contract-hop.mjs`).\n',
  );

  return { stale: true, title, body: sections.map((section) => section.trimEnd()).join('\n\n') + '\n' };
}

/**
 * What to do with the `pin-staleness` issues, given today's report.
 *
 * Acts on the oldest open one; any others are duplicates and close against
 * it. `lastClosed` is the most recently closed one: closed as not planned
 * with today's title, it is a refusal of this exact state, and nothing opens.
 */
export function planIssueAction(openIssues, report, lastClosed = null) {
  const open = [...openIssues].sort((a, b) => a.number - b.number);
  const [keep, ...duplicates] = open;
  if (!report.stale) {
    return open.length > 0 ? { kind: 'close', numbers: open.map((issue) => issue.number) } : { kind: 'none' };
  }
  if (!keep) {
    if (lastClosed?.state_reason === 'not_planned' && lastClosed.title === report.title) {
      return { kind: 'none', held: lastClosed.number };
    }
    return { kind: 'create', duplicates: [] };
  }
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

const transient = (status) => status === 429 || status >= 500;

/**
 * One run, with its I/O injected so the whole flow is testable: `fetchImpl` is
 * `fetch`, `readFile` reads a repository file, `log` prints, `sleep` waits
 * between read retries.
 */
export async function run({
  fetchImpl = fetch,
  readFile,
  env = process.env,
  dryRun = false,
  log = console.log,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  const repo = env.GITHUB_REPOSITORY || DEFAULT_REPO;
  const headers = githubHeaders(token);

  async function request(method, url, { body, accept } = {}) {
    // Reads retry a transient failure; writes never do, so a retried POST
    // cannot open a second issue.
    const attempts = method === 'GET' ? READ_ATTEMPTS : 1;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(`https://api.github.com${url}`, {
          method,
          headers: {
            ...headers,
            ...(accept ? { Accept: accept } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await sleep(500 * attempt);
        continue;
      }
      if (response.ok) return response;
      const error = new Error(`${method} ${url}: ${response.status} ${response.statusText}`);
      error.status = response.status;
      if (!transient(response.status) || attempt === attempts) throw error;
      lastError = error;
      await sleep(500 * attempt);
    }
    throw lastError;
  }
  const api = async (method, url, body) => {
    const response = await request(method, url, { body });
    return response.status === 204 ? null : response.json();
  };
  // The raw media type, not the base64 `content` field: the contents API leaves
  // `content` empty for a file over 1 MB, and contract-notes.json only grows.
  const rawJson = async (repoName, ref, file) => {
    const response = await request('GET', `/repos/${repoName}/contents/${file}?ref=${encodeURIComponent(ref)}`, {
      accept: 'application/vnd.github.raw',
    });
    return JSON.parse(await response.text());
  };

  // Every read first. Any failure throws here, before an issue is touched.
  const pkg = JSON.parse(readFile('package.json'));
  const specifier = pkg.dependencies?.[PACKAGE_NAME] ?? pkg.devDependencies?.[PACKAGE_NAME] ?? '';
  const pinnedSha = /#([0-9a-f]{40})\b/.exec(specifier)?.[1];
  if (!pinnedSha) throw new Error(`${PACKAGE_NAME} is not pinned to a 40-character SHA in package.json`);
  const ourContract = JSON.parse(readFile('api-contract.pin.json'));
  const apiRepo = ourContract.repository ?? 'FaultMaven/faultmaven';

  const [comparison, notes, copilotContract, openIssues, closedIssues] = await Promise.all([
    api('GET', `/repos/${COPILOT_REPO}/compare/${pinnedSha}...${COPILOT_BRANCH}`),
    rawJson(apiRepo, 'main', 'docs/reference/api/contract-notes.json'),
    // Required, not context: copilot's contract pin is the target the
    // Dashboard's contract pin must reach.
    rawJson(COPILOT_REPO, COPILOT_BRANCH, 'api-contract.pin.json'),
    api('GET', `/repos/${repo}/issues?labels=${ISSUE_LABEL}&state=open&per_page=100`),
    api('GET', `/repos/${repo}/issues?labels=${ISSUE_LABEL}&state=closed&sort=updated&direction=desc&per_page=10`),
  ]);
  const servedContract = notes?.contractVersion;
  if (typeof servedContract !== 'string') throw new Error("core's contract-notes.json names no contractVersion");
  if (typeof copilotContract?.contractVersion !== 'string') {
    throw new Error("copilot's api-contract.pin.json names no contractVersion");
  }

  let packageCommits = [];
  if ((comparison?.ahead_by ?? 0) > 0) {
    const pinDate = comparison?.merge_base_commit?.commit?.committer?.date;
    if (!pinDate) throw new Error('the comparison names no merge-base date for the pin');
    const history = await api(
      'GET',
      `/repos/${COPILOT_REPO}/commits?sha=${COPILOT_BRANCH}&path=${encodeURIComponent(PACKAGE_SUBTREE)}` +
        `&since=${encodeURIComponent(pinDate)}&per_page=${PACKAGE_COMMITS_PAGE}`,
    );
    packageCommits = packageCommitsSincePin({ history, comparison, pinnedSha });
  }

  const report = describeStaleness({
    pinnedSha,
    comparison,
    packageCommits,
    ourContract,
    copilotContract,
    servedContract,
    notes,
  });
  const notPr = (issue) => !issue.pull_request;
  const plan = planIssueAction(openIssues.filter(notPr), report, closedIssues.filter(notPr)[0] ?? null);

  log(report.stale ? report.title : 'Pins are current with copilot main.');
  log(
    `Planned action: ${plan.kind}${plan.number ? ` #${plan.number}` : ''}` +
      `${plan.numbers ? ` #${plan.numbers.join(', #')}` : ''}` +
      `${plan.held ? ` (held: #${plan.held} was closed as not planned for this state)` : ''}`,
  );
  if (dryRun) {
    if (report.stale) log(`\n${report.body}`);
    return plan;
  }

  // Writes from here. A failure names what was done before it, so the log
  // never says "nothing was written" after something was.
  const done = [];
  const write = async (what, call) => {
    try {
      const result = await call();
      done.push(what);
      return result;
    } catch (error) {
      error.phase = 'write';
      error.message = `${what} failed (${error.message}); done before it: ${done.length > 0 ? done.join(', ') : 'nothing'}`;
      throw error;
    }
  };

  if (plan.kind === 'close') {
    for (const number of plan.numbers) {
      // Close, then comment: a comment that fails leaves a closed issue the next
      // run does not touch, where the reverse order would repeat the comment.
      await write(`close #${number}`, () =>
        api('PATCH', `/repos/${repo}/issues/${number}`, { state: 'closed', state_reason: 'completed' }),
      );
      await write(`comment on #${number}`, () =>
        api('POST', `/repos/${repo}/issues/${number}/comments`, {
          body:
            `The pins are current with copilot \`${COPILOT_BRANCH}\`: \`${PACKAGE_NAME}\` at \`${short(pinnedSha)}\` ` +
            `and contract ${ourContract.contractVersion}. Closed by the Pin Staleness workflow.`,
        }),
      );
    }
    return plan;
  }

  let number = plan.number;
  if (plan.kind === 'create') {
    await write('create the label', async () => {
      try {
        await api('POST', `/repos/${repo}/labels`, {
          name: ISSUE_LABEL,
          color: 'fbca04',
          description: "A Dashboard pin (copilot-ui or API contract) is behind copilot's main",
        });
      } catch (error) {
        if (error.status !== 422) throw error; // 422: the label exists already.
      }
    });
    number = (
      await write('open the issue', () =>
        api('POST', `/repos/${repo}/issues`, { title: report.title, body: report.body, labels: [ISSUE_LABEL] }),
      )
    ).number;
    log(`Opened #${number}.`);
  } else if (plan.kind === 'update') {
    await write(`update #${number}`, () =>
      api('PATCH', `/repos/${repo}/issues/${number}`, { title: report.title, body: report.body }),
    );
    log(`Updated #${number}.`);
  }
  for (const duplicate of plan.duplicates ?? []) {
    await write(`close duplicate #${duplicate}`, () =>
      api('PATCH', `/repos/${repo}/issues/${duplicate}`, { state: 'closed', state_reason: 'not_planned' }),
    );
    await write(`comment on duplicate #${duplicate}`, () =>
      api('POST', `/repos/${repo}/issues/${duplicate}/comments`, { body: `Duplicate of #${number}.` }),
    );
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
    console.error(
      error.phase === 'write'
        ? `FAIL: ${error.message}`
        : `FAIL: ${error.message}\n    The pins could not be read, so no issue was opened, updated or closed.`,
    );
    process.exit(1);
  });
}
