// @vitest-environment node
/**
 * `pnpm dev` and `pnpm preview` listen on loopback only (faultmaven#2612): with
 * `server.fs.allow` at the repo root, a LAN bind leaves `fs.deny` alone between
 * the network and files such as `.env`. Each command is its script plus
 * `vite.config.ts`, so both halves are pinned: neither script passes `--host`,
 * the dev server the config starts binds the literal `127.0.0.1`, and preview's
 * resolved host is the same. `--host` on either command is the opt-in.
 */
import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer, resolveConfig, type ViteDevServer } from 'vite';

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

  it('bind the dev server to 127.0.0.1, not every interface', async () => {
    // A scratch cache and no dependency scan: the run leaves nothing in
    // node_modules/.vite and shares no cache with a live dev server.
    const cacheDir = await mkdtemp(path.join(tmpdir(), 'dev-server-bind-'));
    let server: ViteDevServer | undefined;
    try {
      server = await createServer({
        configFile,
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
