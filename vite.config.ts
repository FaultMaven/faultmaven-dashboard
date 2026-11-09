/// <reference types="vitest" />
import { defineConfig, normalizePath, type Plugin, type PluginOption } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/** An absolute path as a glob that matches it literally: every character outside `[\w/.:-]` escaped. */
export const literalGlob = (p: string) => normalizePath(p).replace(/[^\w/.:-]/g, '\\$&');
const srcGlob = literalGlob(path.resolve(__dirname, 'src'));

/** What Vitest collects, read by `test.include` and by the deny below, so the two are one list. */
const testInclude = [...configDefaults.include];
/**
 * The tests, anchored to this checkout's src/: the test tree (its files import
 * scripts/) and every file Vitest collects.
 */
const testDeny = [`${srcGlob}/test/**`, ...testInclude.map((pattern) => `${srcGlob}/${pattern}`)];

/** The plugins the Vitest CLI and `createVitest` add to the root server and to each project's. */
const vitestPlugins = new Set(['vitest', 'vitest:project']);

/**
 * Lifts the test deny on Vitest's own servers, which load the suite through
 * this config. Vitest is recognised by its plugin in the config's plugin list,
 * which the CLI and the programmatic API (`createVitest`) both add and no
 * environment variable can; without it the deny holds.
 */
const allowTestsUnderVitest = (): Plugin => ({
  name: 'faultmaven:allow-tests-under-vitest',
  config(config) {
    const isVitest = (option: PluginOption): boolean =>
      Array.isArray(option)
        ? option.some(isVitest)
        : !!option && 'name' in option && vitestPlugins.has(option.name);
    const fsConfig = config.server?.fs;
    if (isVitest(config.plugins) && fsConfig?.deny) {
      fsConfig.deny = fsConfig.deny.filter((pattern) => !testDeny.includes(pattern));
    }
  },
});

export default defineConfig({
  plugins: [react(), allowTestsUnderVitest()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
      '~lib': path.resolve(__dirname, 'src/lib'),
    },
  },
  server: {
    port: 3333,
    // Loopback only (faultmaven#2612); `pnpm dev --host` opts in to the LAN.
    host: '127.0.0.1',
    // What the app serves, so the opt-in exposes the app and not the checkout
    // (faultmaven#2648): this replaces Vite's default, the repo root. Vite also
    // serves any file an allowed module imports, so `deny` withholds the tests
    // (`testDeny`), except on Vitest's own servers (`allowTestsUnderVitest`).
    // `public/` is served by `publicDir`.
    fs: {
      allow: [
        ...['src', 'index.html', 'node_modules'].map((p) => path.resolve(__dirname, p)),
        // A worktree's node_modules may be a symlink, and modules resolve to its real path.
        fs.realpathSync(path.resolve(__dirname, 'node_modules')),
      ],
      // Vite's default list, which an explicit `deny` replaces, plus the tool
      // caches under node_modules and the tests. `.vite/deps` stays served.
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem}',
        '**/.git/**',
        '**/node_modules/.cache/**',
        ...testDeny,
      ],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/test/setup.ts',
    include: testInclude,
    // A git worktree checked out under the repo (`git worktree add
    // .worktrees/<name>`) is a second, usually stale copy of this whole suite.
    // Vitest globs the filesystem and does not read .gitignore, so without this
    // the local run silently collects both copies: a leftover worktree once put
    // `pnpm test` at 103 files / 889 tests instead of 53 / 456, and a green run
    // could be coming from the wrong tree entirely. CI checks out one tree and
    // was never affected — this is a local-only footgun, which is exactly why
    // it went unnoticed.
    //
    // Spread the defaults rather than replacing them: assigning `exclude`
    // overrides vitest's list wholesale, so a bare array would silently stop
    // excluding node_modules.
    //
    // `.claude/worktrees/` is the location Claude Code checks its worktrees out
    // under, and it is the same footgun in a second directory.
    exclude: [...configDefaults.exclude, '**/.worktrees/**', '**/.claude/worktrees/**'],
    coverage: {
      provider: 'v8',
      // Ratchet floors set just below current coverage so it can't silently sink.
      // Raise these as coverage improves; never lower them to make a PR pass.
      thresholds: {
        statements: 30,
        branches: 24,
        functions: 22,
        lines: 32,
      },
    },
  },
});
