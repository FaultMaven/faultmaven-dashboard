// @vitest-environment node
/**
 * `pnpm dev` and `pnpm preview` listen on loopback only (faultmaven#2612), and
 * `--host` on either is the opt-in to the LAN. Each command is its script plus
 * `vite.config.ts`, so both halves are pinned: neither script passes `--host`,
 * the dev server the config starts binds the literal `127.0.0.1`, and preview's
 * resolved host is the same. Preview serves `dist/` only; the dev server serves
 * from the checkout, so what its opt-in exposes is pinned too (faultmaven#2648):
 * the app's files and the files they import answer, and every other file in the
 * checkout, the tests and the tool caches answer 403. Only Vitest's own servers,
 * which load the suite through this config, leave the tests open: recognised by
 * Vitest's plugin, so this file's own servers, started inside a Vitest run, are
 * refused like `pnpm dev`.
 */
import { describe, it, expect } from 'vitest';
import { realpathSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { get as httpGet } from 'node:http';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer, isFileLoadingAllowed, resolveConfig, type ViteDevServer } from 'vite';
import { createVitest } from 'vitest/node';
import { literalGlob } from '../../../vite.config';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const configFile = path.join(repoRoot, 'vite.config.ts');

/** An OS-assigned free port on loopback. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** A GET of a raw path: `fetch` would normalize a `%2e%2e` segment away. */
function get(port: number, urlPath: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    httpGet({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    }).on('error', reject);
  });
}

/** Starts the dev server from the real config on a free loopback port. */
async function withDevServer(run: (server: ViteDevServer, port: number) => Promise<void>, mode?: string) {
  // A scratch cache and no dependency scan: the run leaves nothing in
  // node_modules/.vite and shares no cache with a live dev server.
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'dev-server-bind-'));
  let server: ViteDevServer | undefined;
  try {
    const port = await freePort();
    server = await createServer({
      configFile,
      mode,
      cacheDir,
      optimizeDeps: { noDiscovery: true, include: [] },
      // No warm-up: a module request must not start a graph walk that races close().
      server: { port, preTransformRequests: false },
      logLevel: 'silent',
    });
    await server.listen();
    await run(server, (server.httpServer?.address() as AddressInfo).port);
  } finally {
    await server?.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}

/**
 * Requests the tests, each module before its import: Vite serves a file an
 * allowed module imports, and src/test/ imports scripts/.
 */
async function probeTests(probe: (url: string, sentinel: string) => Promise<void>) {
  await probe('/src/test/scripts/contractHopReport.test.ts', 'describeHop');
  const hop = 'scripts/report-contract-hop.mjs';
  for (const url of [`/${hop}`, `/${hop}?raw`, `/@fs${repoRoot}/${hop}`]) {
    await probe(url, 'WHAT A CONTRACT PIN BUMP CROSSED');
  }
  await probe('/src/lib/cases/closureReason.test.ts', 'contract-vocabularies');
}

describe('pnpm dev and pnpm preview', () => {
  it('pass no --host in their scripts', async () => {
    const pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    // A bare `--host`, `--host <value>` or `--host=<value>`.
    for (const name of ['dev', 'preview']) {
      expect(pkg.scripts[name], `scripts.${name}`).not.toMatch(/(^|\s)--host(\s|=|$)/);
    }
  });

  it('bind the dev server to 127.0.0.1, not every interface', () =>
    withDevServer(async (server) => {
      expect((server.httpServer?.address() as AddressInfo).address).toBe('127.0.0.1');
    }));

  it('serve the app, its dependencies and the public assets from the dev server', () =>
    withDevServer(async (_, port) => {
      const missing: string[] = [];
      for (const [url, sentinel] of [
        ['/index.html', 'data-faultmaven-dashboard-panel'],
        ['/src/main.tsx', 'createRoot'],
        [`/@fs${repoRoot}/node_modules/react/index.js`, 'react.production'],
        [`/@fs${repoRoot}/node_modules/@faultmaven/copilot-ui/index.ts`, 'setHostStore'],
        ['/icon/design-dark.svg', '<svg'],
      ]) {
        const res = await get(port, url);
        // The SPA fallback answers 200 for any path, so the body is the check.
        if (res.status !== 200 || !res.body.includes(sentinel)) missing.push(`${res.status} ${url}`);
      }
      expect(missing).toEqual([]);
    }));

  it('refuse every other file in the checkout from the dev server (faultmaven#2648)', () =>
    withDevServer(async (server, port) => {
      const status: Record<string, number> = {};
      const leaked: string[] = [];
      const probe = async (url: string, sentinel: string) => {
        const res = await get(port, url);
        status[url] = res.status;
        if (res.body.includes(sentinel)) leaked.push(url);
      };
      await probeTests(probe);
      for (const [file, sentinel] of [
        ['.claude/rules/cases.md', 'CaseListPage'],
        ['package.json', '"faultmaven-dashboard"'],
        ['vite.config.ts', 'defineConfig'],
        ['.env.example', 'Environment Configuration'],
      ]) {
        for (const url of [`/${file}`, `/${file}?raw`, `/@fs${repoRoot}/${file}`, `/src/%2e%2e/${file}?raw`]) {
          await probe(url, sentinel);
        }
      }
      expect(status).toEqual(Object.fromEntries(Object.keys(status).map((url) => [url, 403])));
      expect(leaked).toEqual([]);
      // A tool cache is denied whether or not a file exists there to request (an
      // absent one gets the SPA page); the dependency cache beside it is served.
      const modules = path.join(repoRoot, 'node_modules');
      expect(isFileLoadingAllowed(server.config, `${modules}/.cache/jiti/probe.mjs`)).toBe(false);
      expect(isFileLoadingAllowed(server.config, `${modules}/.vite/deps/probe.js`)).toBe(true);
    }));

  it('refuse the tests under --mode test too: only Vitest leaves them open', () =>
    withDevServer(async (_, port) => {
      const refused: string[] = [];
      await probeTests(async (url, sentinel) => {
        const res = await get(port, url);
        if (res.status !== 403 || res.body.includes(sentinel)) refused.push(`${res.status} ${url}`);
      });
      expect(refused).toEqual([]);
    }, 'test'));

  it('resolve fs as Vite reads it: its default deny kept, the tests refused', async () => {
    const resolve = (file: string | false) =>
      resolveConfig({ configFile: file, root: repoRoot, logLevel: 'silent' }, 'serve');
    // An explicit deny replaces Vite's default, so a default a later Vite adds must be copied in.
    const viteDefault = (await resolve(false)).server.fs.deny;
    // This process is a Vitest run, so whatever its environment says, only the plugin opens the deny.
    const asDev = await resolve(configFile);
    expect(asDev.server.fs.deny).toEqual(expect.arrayContaining(viteDefault));
    for (const file of ['src/test/setup.ts', 'src/lib/cases/closureReason.test.ts']) {
      expect(isFileLoadingAllowed(asDev, path.join(repoRoot, file)), file).toBe(false);
    }
  });

  it("leave the tests open on Vitest's programmatic API, which sets no VITEST", async () => {
    // `createVitest` is what IDE runners call; the CLI run this file is part of is the other path.
    const vitest = await createVitest('test', { root: repoRoot, watch: false, run: true }, { logLevel: 'silent' });
    try {
      const configs = new Set([vitest.vite.config, ...vitest.projects.map((project) => project.vite.config)]);
      for (const config of configs) {
        for (const file of ['src/test/setup.ts', 'src/lib/cases/closureReason.test.ts']) {
          expect(isFileLoadingAllowed(config, path.join(repoRoot, file)), file).toBe(true);
        }
      }
    } finally {
      await vitest.close();
    }
  });

  it('escape every glob metacharacter of a checkout path, as Vite matches the deny', async () => {
    // Glob metacharacters and other punctuation a checkout path may hold, `\` too on POSIX;
    // not `:`, since Vite refuses any path that holds one.
    const special = [..."|*?[]{}()!+@#$^,~'& %=;é", ...(process.platform === 'win32' ? [] : ['\\'])];
    const unanchored: string[] = [];
    for (const char of special) {
      const checkout = `/srv/co${char}x`;
      const config = await resolveConfig(
        {
          configFile: false,
          root: repoRoot,
          logLevel: 'silent',
          server: { fs: { allow: [checkout], deny: [`${literalGlob(checkout)}/src/test/**`] } },
        },
        'serve',
      );
      const allowed = (file: string) => isFileLoadingAllowed(config, `${checkout}/${file}`);
      if (!allowed('src/main.tsx')) unanchored.push(`${char} refuses the app`);
      if (allowed('src/test/setup.ts')) unanchored.push(`${char} serves the tests`);
    }
    expect(unanchored).toEqual([]);
  });

  it('withhold every file Vitest collects from any checkout, and allow node_modules by its real path', async () => {
    // A checkout whose path holds every character above that `pnpm dev` can load its config
    // under (not `\` or `*`: the config bundling refuses them), and whose node_modules is a
    // symlink to a directory outside it, as in a worktree.
    const scratch = await mkdtemp(path.join(tmpdir(), 'dev-fs-'));
    const checkout = path.join(scratch, "co |?[]{}()!+@#$^,~'& %=;é");
    try {
      await mkdir(path.join(checkout, 'src'), { recursive: true });
      await writeFile(path.join(checkout, 'package.json'), '{"type": "module"}');
      await copyFile(configFile, path.join(checkout, 'vite.config.ts'));
      const modules = realpathSync(path.join(repoRoot, 'node_modules'));
      await symlink(modules, path.join(checkout, 'node_modules'), 'junction');
      const config = await resolveConfig(
        { configFile: path.join(checkout, 'vite.config.ts'), root: checkout, logLevel: 'silent' },
        'serve',
      );
      const allowed = (file: string) => isFileLoadingAllowed(config, file.split(path.sep).join('/'));
      expect(allowed(path.join(checkout, 'src/main.tsx'))).toBe(true);
      expect(allowed(path.join(checkout, 'node_modules/react/index.js'))).toBe(true);
      expect(allowed(path.join(modules, 'react/index.js'))).toBe(true);
      const tests = [
        'test/setup.ts',
        ...['test.ts', 'spec.tsx', 'test.mjs', 'spec.cjs', 'test.jsx', 'spec.mts'].map((ext) => `lib/a.${ext}`),
      ];
      expect(tests.filter((file) => allowed(path.join(checkout, 'src', file)))).toEqual([]);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  it('resolve preview to 127.0.0.1, not every interface', async () => {
    // How `vite preview` resolves its config: `preview.host`, else `server.host`.
    const isPreview = true;
    const config = await resolveConfig(
      { configFile, logLevel: 'silent' },
      'serve',
      'production',
      'production',
      isPreview,
    );
    expect(config.preview.host).toBe('127.0.0.1');
  });
});
