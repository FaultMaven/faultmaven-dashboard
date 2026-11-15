import { describe, it, expect } from 'vitest';

// Plain ESM scripts with no type declarations.
// @ts-expect-error — a .mjs script with no type declarations.
import { contractEntriesBetween, describeStaleness, planIssueAction, run, ISSUE_LABEL } from '../../../scripts/report-pin-staleness.mjs';
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

const comparison = (files: string[], commits = 3) => ({
  ahead_by: commits,
  files: files.map((filename) => ({ filename })),
  commits: Array.from({ length: commits }, (_, i) => ({
    sha: String(i).repeat(40),
    commit: { message: `commit ${i}\n\nbody` },
  })),
});

const OURS = { repository: 'FaultMaven/faultmaven', ref: 'c'.repeat(40), contractVersion: '14.14.0' };

const describeWith = (over: Record<string, unknown> = {}) =>
  describeStaleness({
    pinnedSha: PIN,
    comparison: comparison(['packages/copilot-ui/shared/x.tsx', 'src/extension/y.ts']),
    ourContract: OURS,
    servedContract: '15.1.0',
    copilotMainContract: { contractVersion: '15.0.0' },
    notes: NOTES,
    ...over,
  });

describe('packageChanges — what "behind" means, shared with the PR gate', () => {
  it('counts only files under the package', () => {
    const files = packageChanges(comparison(['packages/copilot-ui/a.ts', 'src/b.ts', 'packages/other/c.ts']));
    expect(files.map((f: { filename: string }) => f.filename)).toEqual(['packages/copilot-ui/a.ts']);
  });

  it('reads a comparison with no files as nothing changed', () => {
    expect(packageChanges({})).toEqual([]);
  });
});

describe('contractEntriesBetween', () => {
  it('lists the entries above the pin and up to the served version, newest first', () => {
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
});

describe('describeStaleness', () => {
  it('reports nothing when the package is unchanged and the contract is current', () => {
    const report = describeWith({ comparison: comparison(['src/only-extension.ts']), servedContract: '14.14.0' });
    expect(report).toEqual({ stale: false, title: '', body: '' });
  });

  it('names both pins in the title, and a MAJOR when one is crossed', () => {
    expect(describeWith().title).toBe('Pins behind: copilot-ui 3 commits behind; contract 14.14.0 → 15.1.0 (includes MAJOR)');
  });

  it('is stale on the contract alone, with no package section', () => {
    const report = describeWith({ comparison: comparison([]), servedContract: '14.15.0' });
    expect(report.stale).toBe(true);
    expect(report.title).toBe('Pins behind: contract 14.14.0 → 14.15.0');
    expect(report.body).not.toContain('### `@faultmaven/copilot-ui`');
  });

  it('is stale on the package alone, with no contract section', () => {
    const report = describeWith({ servedContract: '14.14.0' });
    expect(report.title).toBe('Pins behind: copilot-ui 3 commits behind');
    expect(report.body).not.toContain('### API contract');
  });

  it('lists every contract crossed by title, one line each, and counts the MAJORs', () => {
    const { body } = describeWith();
    expect(body).toContain('- **15.1.0** MINOR: Turn outcome unknown.');
    expect(body).toContain('- **15.0.0** MAJOR: A case route says what was refused.');
    expect(body).not.toContain('Second line.');
    expect(body).toContain('1 MAJOR change(s) in between');
    expect(body).not.toContain('Already adopted.');
  });

  it('links the comparison and lists the newest commits first', () => {
    const { body } = describeWith();
    expect(body).toContain(`https://github.com/FaultMaven/faultmaven-copilot/compare/${PIN}...main`);
    expect(body.indexOf('commit 2')).toBeLessThan(body.indexOf('commit 0'));
    expect(body).toContain('1 file(s) under `packages/copilot-ui/` changed');
  });

  // Pin parity: copilot-ui cannot move without the contract moving to copilot's.
  it("says a copilot-ui bump also moves the contract pin to copilot's", () => {
    expect(describeWith().body).toContain("also moves the contract pin to **15.0.0**");
    expect(describeWith({ copilotMainContract: { contractVersion: '14.14.0' } }).body).not.toContain(
      'also moves the contract pin',
    );
  });

  it('says so, rather than listing nothing, when the notes could not be read', () => {
    expect(describeWith({ notes: null }).body).toContain('could not be read');
  });

  it('says so when the notes were read but matched nothing', () => {
    expect(describeWith({ notes: { entries: [] } }).body).toContain('No contract entries matched');
  });
});

describe('planIssueAction', () => {
  const stale = { stale: true, title: 'T', body: 'B' };
  const current = { stale: false, title: '', body: '' };

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

  it('leaves an open issue that already says today’s state', () => {
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
    expect(planIssueAction([{ number: 4 }, { number: 9 }], current)).toEqual({ kind: 'close', numbers: [4, 9] });
  });

  it('does nothing when current and none is open', () => {
    expect(planIssueAction([], current)).toEqual({ kind: 'none' });
  });
});

// The whole run against a fake GitHub: reads, then exactly the writes the plan names.
describe('run', () => {
  const PKG = JSON.stringify({
    dependencies: { '@faultmaven/copilot-ui': `github:FaultMaven/faultmaven-copilot#${PIN}&path:packages/copilot-ui` },
  });
  const readFile = (file: string) => (file === 'package.json' ? PKG : JSON.stringify(OURS));
  const encoded = (value: unknown) => ({ content: Buffer.from(JSON.stringify(value)).toString('base64') });

  function fakeGitHub(opts: { openIssues?: unknown[]; failOn?: string; labelStatus?: number } = {}) {
    const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
    const fetchImpl = async (url: string, init: { method: string; body?: string }) => {
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ method: init.method, url, body });
      const reply = (status: number, json: unknown = {}) =>
        ({ ok: status < 400, status, statusText: String(status), json: async () => json }) as Response;
      if (opts.failOn && url.includes(opts.failOn)) return reply(502);
      if (url.includes('/compare/')) return reply(200, { ...comparison(['packages/copilot-ui/a.ts']), head: MAIN });
      if (url.includes('contract-notes.json')) return reply(200, encoded(NOTES));
      if (url.includes('faultmaven-copilot/contents/api-contract.pin.json')) return reply(200, encoded({ contractVersion: '15.0.0' }));
      if (init.method === 'GET' && url.includes('/issues?')) return reply(200, opts.openIssues ?? []);
      if (url.endsWith('/labels')) return reply(opts.labelStatus ?? 201);
      if (init.method === 'POST' && url.endsWith('/issues')) return reply(201, { number: 31 });
      return reply(200, {});
    };
    const writes = () => calls.filter((c) => c.method !== 'GET');
    return { fetchImpl, calls, writes };
  }

  const quiet = () => {};
  const env = { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'FaultMaven/faultmaven-dashboard' };

  it('opens a labelled issue when behind and none is open', async () => {
    const gh = fakeGitHub();
    await run({ fetchImpl: gh.fetchImpl, readFile, env, log: quiet });

    const created = gh.writes().find((c) => c.url.endsWith('/repos/FaultMaven/faultmaven-dashboard/issues'));
    expect(created?.body?.labels).toEqual([ISSUE_LABEL]);
    expect(created?.body?.title).toMatch(/^Pins behind: /);
  });

  it('opens the issue when the label exists already (422)', async () => {
    const gh = fakeGitHub({ labelStatus: 422 });
    await expect(run({ fetchImpl: gh.fetchImpl, readFile, env, log: quiet })).resolves.toMatchObject({ kind: 'create' });
  });

  it('ignores pull requests the issues endpoint also returns', async () => {
    const gh = fakeGitHub({ openIssues: [{ number: 5, title: 'x', pull_request: {} }] });
    await expect(run({ fetchImpl: gh.fetchImpl, readFile, env, log: quiet })).resolves.toMatchObject({ kind: 'create' });
  });

  it('writes nothing on a dry run', async () => {
    const gh = fakeGitHub({ openIssues: [{ number: 5, title: 'old', body: '' }] });
    const plan = await run({ fetchImpl: gh.fetchImpl, readFile, env, dryRun: true, log: quiet });

    expect(plan).toMatchObject({ kind: 'update', number: 5 });
    expect(gh.writes()).toEqual([]);
  });

  // A run that could not see the pins must neither open an issue nor close one.
  it.each(['/compare/', 'contract-notes.json', 'faultmaven-copilot/contents/api-contract.pin.json', '/issues?'])(
    'fails before any write when a read of %s fails',
    async (failOn) => {
      const gh = fakeGitHub({ openIssues: [{ number: 5 }], failOn });
      await expect(run({ fetchImpl: gh.fetchImpl, readFile, env, log: quiet })).rejects.toThrow(/502/);
      expect(gh.writes()).toEqual([]);
    },
  );

  it('closes the open issue with a comment once the pins are current', async () => {
    const current = (file: string) => (file === 'package.json' ? PKG : JSON.stringify({ ...OURS, contractVersion: '15.1.0' }));
    const gh = fakeGitHub({ openIssues: [{ number: 5 }] });
    const fetchImpl = async (url: string, init: { method: string; body?: string }) =>
      url.includes('/compare/')
        ? ({ ok: true, status: 200, statusText: '200', json: async () => comparison(['src/only.ts']) } as Response)
        : gh.fetchImpl(url, init);

    await run({ fetchImpl, readFile: current, env, log: quiet });

    expect(gh.writes().map((c) => `${c.method} ${c.url.replace('https://api.github.com', '')}`)).toEqual([
      'POST /repos/FaultMaven/faultmaven-dashboard/issues/5/comments',
      'PATCH /repos/FaultMaven/faultmaven-dashboard/issues/5',
    ]);
    expect(gh.writes()[1].body).toMatchObject({ state: 'closed' });
  });

  it('refuses a copilot-ui dependency that is not pinned to a SHA, before any request', async () => {
    const gh = fakeGitHub();
    const unpinned = (file: string) =>
      file === 'package.json' ? JSON.stringify({ dependencies: { '@faultmaven/copilot-ui': 'github:x#main' } }) : JSON.stringify(OURS);
    await expect(run({ fetchImpl: gh.fetchImpl, readFile: unpinned, env, log: quiet })).rejects.toThrow(/40-character SHA/);
    expect(gh.calls).toEqual([]);
  });
});
