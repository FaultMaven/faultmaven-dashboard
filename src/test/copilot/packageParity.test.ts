import { describe, it, expect } from 'vitest';

/**
 * One API contract, and one set of assets, across both clients in this bundle.
 *
 * `check-copilot-ui-pin.mjs` asserts the CONSISTENCY leg against the network:
 * the copilot repository's `api-contract.pin.json` at the pinned SHA equals
 * this repository's. These are the offline halves of the same idea, and they
 * catch what a pin file cannot:
 *
 *  - the generated clients themselves, byte for byte. Two clients typed against
 *    two contracts in one bundle mostly COMPILES — structural typing sees to
 *    that — and shows up at runtime as a field that is silently absent.
 *  - the assets. The shared UI references its logo as `/icon/*.svg`,
 *    root-absolute, which is the one form that resolves identically in an
 *    extension page and on a web page. A missing one is a broken `<img>`, with
 *    nothing thrown and nothing red.
 */

const ourApiTypes = (
  await import('../../types/api.generated.ts?raw')
).default as unknown as string;

const packageApiTypes = (
  await import('@faultmaven/copilot-ui/types/api.generated.ts?raw')
).default as unknown as string;

describe('generated API clients', () => {
  it('is not empty on either side', () => {
    // Fail closed. Two empty strings compare equal, and a resolution that
    // silently produced nothing would make the next assertion vacuous.
    expect(ourApiTypes.length).toBeGreaterThan(10_000);
    expect(packageApiTypes.length).toBeGreaterThan(10_000);
  });

  it('is byte-identical between this app and the Copilot UI package', () => {
    // Both are generated from the same committed `openapi.json` by the same
    // generator, so any difference means the two pins have drifted apart — and
    // this bundle would hold two clients describing two different servers.
    expect(packageApiTypes).toBe(ourApiTypes);
  });
});

/** Every `/icon/...` path the shared UI asks the host to serve. */
const packageSources = import.meta.glob<string>(
  [
    '/node_modules/@faultmaven/copilot-ui/shared/**/*.{ts,tsx}',
    '/node_modules/@faultmaven/copilot-ui/lib/**/*.{ts,tsx}',
  ],
  { query: '?raw', import: 'default', eager: true },
);

/** Everything this app actually serves at its web root. */
const servedIcons = import.meta.glob('/public/icon/*', { eager: true });

describe('assets the shared UI references', () => {
  it('finds icon references to check', () => {
    const referenced = collectIconReferences();
    expect(Object.keys(packageSources).length).toBeGreaterThan(0);
    expect(referenced.size).toBeGreaterThan(0);
  });

  it('serves every one of them from public/', () => {
    const served = new Set(
      Object.keys(servedIcons).map((path) => path.replace('/public', '')),
    );
    for (const reference of collectIconReferences()) {
      expect(served, `the package renders ${reference}; public/ must serve it`).toContain(
        reference,
      );
    }
  });
});

function collectIconReferences(): Set<string> {
  const found = new Set<string>();
  for (const text of Object.values(packageSources)) {
    for (const match of text.matchAll(/["'`](\/icon\/[A-Za-z0-9._-]+)["'`]/g)) {
      found.add(match[1]);
    }
  }
  return found;
}
