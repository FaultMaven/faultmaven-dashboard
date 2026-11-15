import { describe, it, expect } from 'vitest';

import {
  contractEntriesBetween,
  contractIsBehind,
  describeStaleness,
  packageCommitsSincePin,
  planIssueAction,
  run,
  ISSUE_LABEL,
  // @ts-expect-error — a .mjs script with no type declarations.
} from '../../../scripts/report-pin-staleness.mjs';
// @ts-expect-error — a .mjs script with no type declarations.
import { packageChanges } from '../../../scripts/lib/pin-staleness.mjs';

const PIN = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);

/** Core's contract notes, deliberately OLDEST first so ordering is the code's. */
const NOTES = {
  contractVersion: '15.1.0',
  entries: [
    { version: '14.14.0', level: 'MINOR', title: 'Already adopted.' },
    { version: '14.15.0', level: 'MINOR', title: 'Delete in progress.' },
    { version: '15.0.0', level: 'MAJOR', title: 'A case route says what was refused.\nSecond line.' },
    { version: '15.1.0', level: 'MINOR', title: 'Turn outcome unknown.' },
  ],
};

type Commit = { sha: string; commit?: { message: string } };

const sha = (tag: string) => tag.padEnd(40, 'f');

/** Commits ahead of the pin, oldest first, as the compare API lists them. */
const comparison = (files: string[], ahead: Commit[] = [1, 2, 3].map((i) => ({ sha: sha(`c${i}`) }))) => ({
  ahead_by: ahead.length,
  files: files.map((filename) => ({ filename })),
  commits: ahead,
  merge_base_commit: { sha: PIN, commit: { committer: { date: '2026-11-08T22:00:00Z' } } },
});

/** Commits touching the package since the pin, newest first, as the commits API returns them. */
const pkgCommits = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ sha: sha(`p${i}`), commit: { message: `pkg change ${i} (#4${i})\n\nbody` } }));

const OURS = { repository: 'FaultMaven/faultmaven', ref: 'c'.repeat(40), contractVersion: '14.14.0' };
const COPILOT_PIN = { contractVersion: '15.0.0' };

const describeWith = (over: Record<string, unknown> = {}) =>
  describeStaleness({
    pinnedSha: PIN,
    comparison: comparison(['packages/copilot-ui/shared/x.tsx', 'src/extension/y.ts']),
    packageCommits: pkgCommits(2),
    ourContract: OURS,
    copilotContract: COPILOT_PIN,
    servedContract: '15.1.0',
    notes: NOTES,
    ...over,
  });

const current = { comparison: comparison([], []), packageCommits: [], copilotContract: { contractVersion: '14.14.0' } };

describe('packageChanges — the package-subtree rule, shared with the PR gate', () => {
  it('counts only files under the package', () => {
    const files = packageChanges(comparison(['packages/copilot-ui/a.ts', 'src/b.ts', 'packages/other/c.ts']));
    expect(files.map((f: { filename: string }) => f.filename)).toEqual(['packages/copilot-ui/a.ts']);
  });

  it('reads a comparison with no files as nothing changed', () => {
    expect(packageChanges({})).toEqual([]);
  });
});

describe('contract versions', () => {
  it('lists the entries above the pin and up to the target, newest first', () => {
    expect(contractEntriesBetween(NOTES.entries, '14.14.0', '15.1.0').map((e: { version: string }) => e.version)).toEqual([
      '15.1.0',
      '15.0.0',
      '14.15.0',
    ]);
  });

  it('orders numerically, not lexically', () => {
    const entries = [{ version: '14.9.0' }, { version: '14.10.0' }];
    expect(contractEntriesBetween(entries, '14.8.0', '14.10.0').map((e: { version: string }) => e.version)).toEqual([
      '14.10.0',
      '14.9.0',
    ]);
  });

  it('answers null when a version does not parse', () => {
    expect(contractEntriesBetween(NOTES.entries, 'latest', '15.1.0')).toBeNull();
  });

  it('is behind only when the target is newer', () => {
    expect(contractIsBehind('14.14.0', '15.0.0')).toBe(true);
    expect(contractIsBehind('15.1.0', '15.0.0')).toBe(false);
    expect(contractIsBehind('15.0.0', '15.0.0')).toBe(false);
    expect(contractIsBehind('15.0.0', 'next')).toBe(true);
  });
});

describe('packageCommitsSincePin', () => {
  // `since` is a timestamp: a rebase-merged batch shares the pin's second.
  it('keeps only commits the comparison lists as ahead, dropping same-second siblings of the pin', () => {
    const history = [{ sha: sha('c3') }, { sha: sha('sibling') }, { sha: PIN }];
    const commits = packageCommitsSincePin({ history, comparison: comparison([]), pinnedSha: PIN });
    expect(commits.map((c: Commit) => c.sha)).toEqual([sha('c3')]);
  });

  it('counts nothing when main is not ahead of the pin', () => {
    const history = [{ sha: sha('sibling') }];
    expect(packageCommitsSincePin({ history, comparison: comparison([], []), pinnedSha: PIN })).toEqual([]);
  });

  it('drops the pin and the merge base when the comparison is capped', () => {
    const capped = { ...comparison([]), ahead_by: 400, merge_base_commit: { sha: sha('base') } };
    const history = [{ sha: sha('new') }, { sha: sha('base') }, { sha: PIN }];
    expect(packageCommitsSincePin({ history, comparison: capped, pinnedSha: PIN }).map((c: Commit) => c.sha)).toEqual([
      sha('new'),
    ]);
  });
});

describe('describeStaleness', () => {
  it('reports nothing when the package and the contract match copilot main', () => {
    expect(describeWith(current)).toEqual({ stale: false, title: '', body: '' });
  });

  it('names both pins in the title, and a MAJOR when one is crossed', () => {
    expect(describeWith().title).toBe(
      'Pins behind copilot main: copilot-ui 2 package commits; contract 14.14.0 → 15.0.0 (includes MAJOR)',
    );
  });

  // Pin parity: the Dashboard cannot adopt a contract copilot has not.
  it("measures the contract against copilot's pin, not core's served version", () => {
    expect(describeWith({ ...current, servedContract: '15.1.0' }).stale).toBe(false);
  });

  it("mentions a newer contract on core as copilot's step, without counting it", () => {
    const { title, body } = describeWith();
    expect(title).not.toContain('15.1.0');
    expect(body).toContain("Core's `main` serves **15.1.0**, which copilot has not adopted yet.");
    expect(body).not.toContain('Turn outcome unknown.');
  });

  it('says nothing about core when copilot is current with it', () => {
    expect(describeWith({ servedContract: '15.0.0' }).body).not.toContain("Core's `main` serves");
  });

  it('is stale on the contract alone, with no package section', () => {
    const report = describeWith({ comparison: comparison([], []), packageCommits: [] });
    expect(report.title).toBe('Pins behind copilot main: contract 14.14.0 → 15.0.0 (includes MAJOR)');
    expect(report.body).not.toContain('### `@faultmaven/copilot-ui`');
  });

  it('is stale on the package alone, with no contract section', () => {
    const report = describeWith({ copilotContract: { contractVersion: '14.14.0' } });
    expect(report.title).toBe('Pins behind copilot main: copilot-ui 2 package commits');
    expect(report.body).not.toContain('### API contract');
  });

  it('says one pull request moves both pins', () => {
    expect(describeWith().body).toContain('One pull request moves both pins');
  });

  it('lists every contract crossed by title, one line each, and counts the MAJORs', () => {
    const { body } = describeWith();
    expect(body).toContain('- **15.0.0** MAJOR: `` A case route says what was refused. ``');
    expect(body).toContain('- **14.15.0** MINOR: `` Delete in progress. ``');
    expect(body).not.toContain('Second line.');
    expect(body).toContain('1 MAJOR change(s) in between');
    expect(body).not.toContain('Already adopted.');
  });

  // GitHub refuses an issue body over 65,536 characters.
  it('caps the contract listing, and says what it left out', () => {
    const entries = Array.from({ length: 300 }, (_, i) => ({
      version: `1.${i + 1}.0`,
      level: i === 0 ? 'MAJOR' : 'MINOR',
      title: 'x'.repeat(900),
    }));
    const { body } = describeWith({
      ourContract: { ...OURS, contractVersion: '1.0.0' },
      copilotContract: { contractVersion: '1.300.0' },
      servedContract: '1.300.0',
      notes: { entries },
    });
    expect(body.length).toBeLessThan(65536);
    expect(body.match(/^- \*\*1\./gm)).toHaveLength(20);
    expect(body).toContain('… and 280 older entries, 1 of them MAJOR');
  });

  it('links the comparison and lists the package commits newest first', () => {
    const { body } = describeWith();
    expect(body).toContain(`https://github.com/FaultMaven/faultmaven-copilot/compare/${PIN}...main`);
    expect(body).toContain('2 commit(s) on `main` since then touch `packages/copilot-ui/`, where 1 file(s) changed');
    expect(body.indexOf('pkg change 0')).toBeLessThan(body.indexOf('pkg change 1'));
  });

  // An extension-only merge must not rewrite the issue.
  it('carries no repository-wide commit count, so an extension-only merge changes nothing', () => {
    const files = ['packages/copilot-ui/shared/x.tsx'];
    const before = describeWith({ comparison: comparison(files, [{ sha: sha('c1') }]) });
    const after = describeWith({ comparison: comparison(files, [{ sha: sha('c1') }, { sha: sha('ext') }]) });
    expect(after).toEqual(before);
  });

  it('describes package files changed with no package commit found, without "0 of them"', () => {
    const { title, body } = describeWith({ packageCommits: [] });
    expect(title).toContain('Pins behind copilot main: copilot-ui;');
    expect(body).toContain('1 file(s) under `packages/copilot-ui/` changed on `main` since then');
    expect(body).not.toMatch(/\b0 commit/);
  });

  // Copilot subjects end in "(#412)": plain, GitHub links THIS repository's #412.
  it("shows other repositories' text in code spans, so no reference links and no mention notifies", () => {
    const { body } = describeWith({
      packageCommits: [{ sha: sha('e'), commit: { message: 'fix: thanks @someone (#412)' } }],
      notes: { entries: [{ version: '15.0.0', level: 'MINOR', title: 'Cites `x` and #2806.' }] },
    });
    expect(body).toContain('`` fix: thanks @someone (#412) ``');
    expect(body).toContain('`` Cites `x` and #2806. ``');
    expect(body.replace(/``[^`]*(`[^`]+`[^`]*)*``/g, '')).not.toMatch(/#\d|@someone/);
  });

  it('counts a full page of package commits as N+', () => {
    expect(describeWith({ packageCommits: pkgCommits(100) }).title).toContain('copilot-ui 100+ package commits');
  });

  // The compare API lists at most 300 files for the whole repository.
  it('reads a truncated comparison with commits ahead as behind, never as current', () => {
    const files = Array.from({ length: 300 }, (_, i) => `src/extension/f${i}.ts`);
    const report = describeWith({
      comparison: comparison(files),
      packageCommits: [],
      copilotContract: { contractVersion: '14.14.0' },
    });
    expect(report.stale).toBe(true);
    expect(report.body).toContain('at least 0 file(s) under `packages/copilot-ui/`');
  });

  it('is not behind on a package with nothing ahead, whatever the history returned', () => {
    expect(describeWith({ ...current, packageCommits: pkgCommits(2) }).stale).toBe(false);
  });

  it('is stale on the package history alone, when the file list missed the package', () => {
    const report = describeWith({ comparison: comparison(['src/x.ts']), copilotContract: { contractVersion: '14.14.0' } });
    expect(report.title).toBe('Pins behind copilot main: copilot-ui 2 package commits');
  });

  it('does not report a contract pin that is AHEAD of copilot', () => {
    const report = describeWith({ ...current, ourContract: { ...OURS, contractVersion: '15.1.0' }, copilotContract: COPILOT_PIN });
    expect(report.stale).toBe(false);
  });

  it('reports versions that do not parse when they differ, for a human to check', () => {
    const report = describeWith({ ...current, copilotContract: { contractVersion: 'next' } });
    expect(report.stale).toBe(true);
    expect(report.body).toContain('do not parse');
  });

  it('says so, rather than listing nothing, when the notes could not be read', () => {
    expect(describeWith({ notes: null }).body).toContain('could not be read');
  });

  it('says so when the notes were read but matched nothing', () => {
    expect(describeWith({ notes: { entries: [] } }).body).toContain('No contract entries matched');
  });

  it('tells the reader that closing as not planned holds', () => {
    expect(describeWith().body).toContain('Closing it as **not planned** records a decision not to adopt now');
  });
});

describe('planIssueAction', () => {
  const stale = { stale: true, title: 'T', body: 'B' };
  const notStale = { stale: false, title: '', body: '' };

  it('opens an issue when behind and none is open', () => {
    expect(planIssueAction([], stale)).toEqual({ kind: 'create', duplicates: [] });
  });

  it('rewrites the open issue when behind', () => {
    expect(planIssueAction([{ number: 7, title: 'old', body: 'B' }], stale)).toEqual({
      kind: 'update',
      number: 7,
      duplicates: [],
    });
  });

  it("leaves an open issue that already says today's state", () => {
    expect(planIssueAction([{ number: 7, title: 'T', body: 'B' }], stale).kind).toBe('none');
  });

  it('keeps the oldest open issue and closes the rest as duplicates', () => {
    expect(planIssueAction([{ number: 9, title: 'x' }, { number: 4, title: 'y' }], stale)).toEqual({
      kind: 'update',
      number: 4,
      duplicates: [9],
    });
  });

  it('closes every open issue when the pins are current', () => {
    expect(planIssueAction([{ number: 4 }, { number: 9 }], notStale)).toEqual({ kind: 'close', numbers: [4, 9] });
  });

  it('does nothing when current and none is open', () => {
    expect(planIssueAction([], notStale)).toEqual({ kind: 'none' });
  });

  // A refusal is a decision; reopening it every morning would overrule it.
  it('opens nothing while the state is the one closed as not planned', () => {
    expect(planIssueAction([], stale, { number: 12, title: 'T', state_reason: 'not_planned' })).toEqual({
      kind: 'none',
      held: 12,
    });
  });

  it('opens a new issue once the state moves past the refused one', () => {
    expect(planIssueAction([], stale, { number: 12, title: 'older state', state_reason: 'not_planned' }).kind).toBe(
      'create',
    );
  });

  it('opens a new issue after one closed as completed', () => {
    expect(planIssueAction([], stale, { number: 12, title: 'T', state_reason: 'completed' }).kind).toBe('create');
  });
});

// The whole run against a fake GitHub: reads, then exactly the writes the plan names.
describe('run', () => {
  const PKG = JSON.stringify({
    dependencies: { '@faultmaven/copilot-ui': `github:FaultMaven/faultmaven-copilot#${PIN}&path:packages/copilot-ui` },
  });
  const readFile = (file: string) => (file === 'package.json' ? PKG : JSON.stringify(OURS));
  const currentPins = (file: string) =>
    file === 'package.json' ? PKG : JSON.stringify({ ...OURS, contractVersion: '15.0.0' });

  type Init = { method: string; body?: string; headers: Record<string, string> };
  type Opts = {
    openIssues?: unknown[];
    closedIssues?: unknown[];
    failOn?: string;
    failTimes?: number;
    failStatus?: number;
    labelStatus?: number;
    files?: string[];
    ahead?: Commit[];
    history?: Commit[];
    failWrite?: string;
  };

  function fakeGitHub(opts: Opts = {}) {
    const calls: { method: string; url: string; body?: Record<string, unknown>; accept?: string }[] = [];
    let failures = 0;
    const fetchImpl = async (url: string, init: Init) => {
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ method: init.method, url, body, accept: init.headers.Accept });
      const reply = (status: number, json: unknown = {}) =>
        ({
          ok: status < 400,
          status,
          statusText: String(status),
          json: async () => json,
          text: async () => JSON.stringify(json),
        }) as Response;
      if (opts.failOn && url.includes(opts.failOn) && failures < (opts.failTimes ?? Infinity)) {
        failures += 1;
        return reply(opts.failStatus ?? 502);
      }
      if (opts.failWrite && init.method !== 'GET' && url.includes(opts.failWrite)) return reply(502);
      if (url.includes('/compare/')) {
        return reply(200, { ...comparison(opts.files ?? ['packages/copilot-ui/a.ts'], opts.ahead), head: MAIN });
      }
      if (url.includes('/commits?')) {
        return reply(
          200,
          opts.history ?? [
            { sha: sha('c3'), commit: { message: 'pkg change' } },
            { sha: PIN, commit: { message: 'PINNED-COMMIT-SUBJECT' } },
          ],
        );
      }
      if (url.includes('contract-notes.json')) return reply(200, NOTES);
      if (url.includes('faultmaven-copilot/contents/api-contract.pin.json')) return reply(200, COPILOT_PIN);
      if (init.method === 'GET' && url.includes('state=open')) return reply(200, opts.openIssues ?? []);
      if (init.method === 'GET' && url.includes('state=closed')) return reply(200, opts.closedIssues ?? []);
      if (url.endsWith('/labels')) return reply(opts.labelStatus ?? 201);
      if (init.method === 'POST' && url.endsWith('/issues')) return reply(201, { number: 31 });
      return reply(200, {});
    };
    const writes = () => calls.filter((c) => c.method !== 'GET');
    return { fetchImpl, calls, writes };
  }

  const quiet = () => {};
  const noSleep = async () => {};
  const env = { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'FaultMaven/faultmaven-dashboard' };
  const go = (gh: ReturnType<typeof fakeGitHub>, over: Record<string, unknown> = {}) =>
    run({ fetchImpl: gh.fetchImpl, readFile, env, log: quiet, sleep: noSleep, ...over });

  it('opens a labelled issue when behind and none is open', async () => {
    const gh = fakeGitHub();
    await go(gh);

    const created = gh.writes().find((c) => c.url.endsWith('/repos/FaultMaven/faultmaven-dashboard/issues'));
    expect(created?.body?.labels).toEqual([ISSUE_LABEL]);
    expect(created?.body?.title).toMatch(/^Pins behind copilot main: /);
  });

  it('opens the issue when the label exists already (422)', async () => {
    await expect(go(fakeGitHub({ labelStatus: 422 }))).resolves.toMatchObject({ kind: 'create' });
  });

  it('ignores pull requests the issues endpoint also returns', async () => {
    await expect(go(fakeGitHub({ openIssues: [{ number: 5, title: 'x', pull_request: {} }] }))).resolves.toMatchObject({
      kind: 'create',
    });
  });

  it('holds when the last closed issue refused this exact state', async () => {
    const logs: string[] = [];
    await go(fakeGitHub(), { dryRun: true, log: (line: string) => logs.push(line) });
    const gh = fakeGitHub({ closedIssues: [{ number: 12, title: logs[0], state_reason: 'not_planned' }] });

    await expect(go(gh)).resolves.toEqual({ kind: 'none', held: 12 });
    expect(gh.writes()).toEqual([]);
  });

  it('writes nothing on a dry run', async () => {
    const gh = fakeGitHub({ openIssues: [{ number: 5, title: 'old', body: '' }] });
    const plan = await go(gh, { dryRun: true });

    expect(plan).toMatchObject({ kind: 'update', number: 5 });
    expect(gh.writes()).toEqual([]);
  });

  // A run that could not see the pins must neither open an issue nor close one.
  it.each([
    '/compare/',
    '/commits?',
    'contract-notes.json',
    'faultmaven-copilot/contents/api-contract.pin.json',
    'state=open',
    'state=closed',
  ])('fails before any write when a read of %s keeps failing', async (failOn) => {
    const gh = fakeGitHub({ openIssues: [{ number: 5 }], failOn });
    await expect(go(gh)).rejects.toThrow(/502/);
    expect(gh.writes()).toEqual([]);
  });

  it('retries a transient read failure and goes on', async () => {
    const gh = fakeGitHub({ failOn: '/compare/', failTimes: 2, failStatus: 503 });
    await expect(go(gh)).resolves.toMatchObject({ kind: 'create' });
    expect(gh.calls.filter((c) => c.url.includes('/compare/'))).toHaveLength(3);
  });

  it('does not retry a read that is refused, not transient', async () => {
    const gh = fakeGitHub({ failOn: '/compare/', failStatus: 404 });
    await expect(go(gh)).rejects.toThrow(/404/);
    expect(gh.calls.filter((c) => c.url.includes('/compare/'))).toHaveLength(1);
  });

  // A retried POST could open a second issue.
  it('never retries a write, even a transient failure', async () => {
    const gh = fakeGitHub({ failWrite: '/faultmaven-dashboard/issues' });
    await expect(go(gh)).rejects.toMatchObject({ phase: 'write' });
    expect(gh.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/faultmaven-dashboard/issues'))).toHaveLength(1);
  });

  // Close first: a failed comment then leaves a closed issue, not a repeated comment tomorrow.
  it('closes the open issue, then comments, once the pins are current', async () => {
    const gh = fakeGitHub({ openIssues: [{ number: 5 }], files: [], ahead: [] });

    await go(gh, { readFile: currentPins });

    expect(gh.writes().map((c) => `${c.method} ${c.url.replace('https://api.github.com', '')}`)).toEqual([
      'PATCH /repos/FaultMaven/faultmaven-dashboard/issues/5',
      'POST /repos/FaultMaven/faultmaven-dashboard/issues/5/comments',
    ]);
    expect(gh.writes()[0].body).toMatchObject({ state: 'closed' });
    // Nothing ahead: the package history is not even read.
    expect(gh.calls.some((c) => c.url.includes('/commits?'))).toBe(false);
  });

  it('says which write failed and what was done before it', async () => {
    const gh = fakeGitHub({ openIssues: [{ number: 5 }], files: [], ahead: [], failWrite: '/comments' });
    const failure = go(gh, { readFile: currentPins });

    await expect(failure).rejects.toMatchObject({ phase: 'write' });
    await expect(failure).rejects.toThrow(/comment on #5 failed .*done before it: close #5/);
  });

  // The contents API leaves `content` empty past 1 MB; the raw media type does not.
  it('reads repository files as raw media, not base64 content', async () => {
    const gh = fakeGitHub();
    await go(gh, { dryRun: true });

    const contentReads = gh.calls.filter((c) => c.url.includes('/contents/'));
    expect(contentReads).toHaveLength(2);
    expect(contentReads.every((c) => c.accept === 'application/vnd.github.raw')).toBe(true);
  });

  it('asks the commits API for the package path since the pin, and counts only commits ahead', async () => {
    const gh = fakeGitHub({ files: ['src/only.ts'] });
    const logs: string[] = [];
    await go(gh, { dryRun: true, log: (line: string) => logs.push(line) });

    const history = gh.calls.find((c) => c.url.includes('/commits?'));
    expect(history?.url).toContain('path=packages%2Fcopilot-ui%2F');
    expect(history?.url).toContain('since=2026-11-08T22%3A00%3A00Z');
    expect(logs[0]).toContain('copilot-ui 1 package commit;');
    expect(logs.join('\n')).not.toContain('PINNED-COMMIT-SUBJECT');
  });

  it('refuses a copilot-ui dependency that is not pinned to a SHA, before any request', async () => {
    const gh = fakeGitHub();
    const unpinned = (file: string) =>
      file === 'package.json'
        ? JSON.stringify({ dependencies: { '@faultmaven/copilot-ui': 'github:x#main' } })
        : JSON.stringify(OURS);
    await expect(go(gh, { readFile: unpinned })).rejects.toThrow(/40-character SHA/);
    expect(gh.calls).toEqual([]);
  });
});
