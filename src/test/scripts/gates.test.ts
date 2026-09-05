import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The gates' OWN failure states.
 *
 * Both build-output gates answer a question about `dist/`, and both can reach
 * "nothing to report" two ways that look like success from the outside: the
 * directory is missing because nobody built, or it is there and empty because
 * the build produced nothing. A gate that exits 0 in either case is a green
 * tick standing in for an unasked question — which is strictly worse than no
 * gate, because it is trusted.
 *
 * Run as subprocesses, because that is how CI runs them: the exit CODE is the
 * whole contract, and a function that returns cleanly while `process.exit(1)`
 * is pending would pass an in-process assertion.
 */

const REPO = process.cwd();

function runGate(script: string, cwd: string): { code: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [join(REPO, 'scripts', script)], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function withTempDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'fm-gate-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const GATES = ['check-web-bundle-boundary.mjs', 'check-shared-ui-styles.mjs'] as const;

/**
 * Tailwind preflight, as the built stylesheet carries it.
 *
 * The styles gate now also refuses a build with no reset, so a fixture that
 * only carries the shared-UI classes fails for a reason the test is not about.
 */
const PREFLIGHT = '*,:before,:after{box-sizing:border-box}body{margin:0}';

describe.each(GATES)('%s', (gate) => {
  it('FAILS when there is no dist/ at all', () => {
    withTempDir((dir) => {
      const { code, output } = runGate(gate, dir);
      expect(code).toBe(1);
      expect(output).toMatch(/FAIL/);
    });
  });

  it('FAILS when dist/ exists but holds nothing to scan', () => {
    // The subtler one: a build that emitted nothing leaves a directory behind,
    // and a gate that walks it finds no violations — which is not a pass.
    withTempDir((dir) => {
      mkdirSync(join(dir, 'dist', 'assets'), { recursive: true });
      const { code, output } = runGate(gate, dir);
      expect(code).toBe(1);
      expect(output).toMatch(/not a pass/i);
    });
  });

  it('does not mistake unrelated files for something it can scan', () => {
    withTempDir((dir) => {
      mkdirSync(join(dir, 'dist', 'assets'), { recursive: true });
      writeFileSync(join(dir, 'dist', 'assets', 'logo.svg'), '<svg/>');
      const { code } = runGate(gate, dir);
      expect(code).toBe(1);
    });
  });
});

describe('check-web-bundle-boundary.mjs', () => {
  it('passes on a clean bundle and FAILS on a sign-in marker', () => {
    withTempDir((dir) => {
      const assets = join(dir, 'dist', 'assets');
      mkdirSync(assets, { recursive: true });
      writeFileSync(join(assets, 'app.js'), 'console.log("hello");');
      writeFileSync(join(assets, 'app.css'), '.a{color:red}');
      expect(runGate('check-web-bundle-boundary.mjs', dir).code).toBe(0);

      // The user-visible copy is what carries this: string literals survive
      // minification, so a screen that reached the bundle is named here whatever
      // the mangler did to its component.
      writeFileSync(join(assets, 'app.js'), 'x("Sign in with Organization")');
      const { code, output } = runGate('check-web-bundle-boundary.mjs', dir);
      expect(code).toBe(1);
      expect(output).toMatch(/Sign in with Organization/);
    });
  });
});

describe('check-shared-ui-styles.mjs', () => {
  it('FAILS when the shared UI classes are absent from the stylesheet', () => {
    // A missing Tailwind token throws nothing: the class is never emitted and
    // the panel renders unstyled. This is the only thing that says so.
    withTempDir((dir) => {
      const assets = join(dir, 'dist', 'assets');
      mkdirSync(assets, { recursive: true });
      writeFileSync(join(assets, 'app.css'), `${PREFLIGHT}.some-other-class{color:red}`);

      const { code, output } = runGate('check-shared-ui-styles.mjs', dir);
      expect(code).toBe(1);
      expect(output).toMatch(/bg-fm-bg/);
    });
  });

  it('passes when they are all present', () => {
    withTempDir((dir) => {
      const assets = join(dir, 'dist', 'assets');
      mkdirSync(assets, { recursive: true });
      writeFileSync(
        join(assets, 'app.css'),
        `${PREFLIGHT}.bg-fm-bg{}.font-fm-sans{}.hover\\:bg-fm-accent-strong:hover{}`,
      );
      expect(runGate('check-shared-ui-styles.mjs', dir).code).toBe(0);
    });
  });
});


describe('check-shared-ui-styles.mjs — preflight', () => {
  it('FAILS when the stylesheet carries no Tailwind preflight', () => {
    // The regression this gate was added for: the package stopped shipping a
    // global reset, this app had none of its own, and every page kept the UA
    // body margin and fell back to content-box. Nothing threw.
    withTempDir((dir) => {
      const assets = join(dir, 'dist', 'assets');
      mkdirSync(assets, { recursive: true });
      writeFileSync(
        join(assets, 'app.css'),
        '.bg-fm-bg{}.font-fm-sans{}.hover\\:bg-fm-accent-strong:hover{}',
      );

      const { code, output } = runGate('check-shared-ui-styles.mjs', dir);
      expect(code).toBe(1);
      expect(output).toMatch(/preflight/i);
    });
  });

  it('is not satisfied by the panel-scoped box-sizing rule', () => {
    // `.fm-copilot-panel *` also sets box-sizing. Matching that would pass on a
    // build with no preflight at all, which is precisely the broken build.
    withTempDir((dir) => {
      const assets = join(dir, 'dist', 'assets');
      mkdirSync(assets, { recursive: true });
      writeFileSync(
        join(assets, 'app.css'),
        '.fm-copilot-panel *,.fm-copilot-panel :before{box-sizing:border-box}' +
          '.bg-fm-bg{}.font-fm-sans{}.hover\\:bg-fm-accent-strong:hover{}',
      );

      expect(runGate('check-shared-ui-styles.mjs', dir).code).toBe(1);
    });
  });
});
