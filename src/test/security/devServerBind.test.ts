// @vitest-environment node
/**
 * `pnpm dev` and `pnpm preview` listen on loopback only (faultmaven#2612): with
 * `server.fs.allow` at the repo root, a LAN bind leaves `fs.deny` alone between
 * the network and files such as `.env`. Each command is its script plus
 * `vite.config.ts` (`vite preview` inherits `server.host`), so both halves are
 * pinned: neither script passes `--host`, and the server the config starts
 * binds the literal `127.0.0.1`. `pnpm dev --host` is the opt-in.
 */
import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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

  it('read a config whose server binds 127.0.0.1, not every interface', async () => {
    // A scratch cache and no dependency scan: the run leaves nothing in
    // node_modules/.vite and shares no cache with a live dev server.
    const cacheDir = await mkdtemp(path.join(tmpdir(), 'dev-server-bind-'));
    let server: ViteDevServer | undefined;
    try {
      server = await createServer({
        configFile: path.join(repoRoot, 'vite.config.ts'),
        cacheDir,
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { port: await freePort() },
        logLevel: 'silent',
      });
      await server.listen();
      expect((server.httpServer?.address() as AddressInfo).address).toBe('127.0.0.1');
    } finally {
      await server?.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});
