// Security response headers: nginx.conf + vercel.json (#68).
//
// Two independent things are checked here, and the distinction is the point.
//
// CONSISTENCY: nginx's `add_header` is not additive. A `location` block that
// declares even one header of its own silently DISCARDS every header inherited
// from the server block. The config therefore repeats the full security set in
// every location, and nginx.conf carries a comment asking humans to keep the
// copies in step. That is a hand-maintained invariant with nothing enforcing
// it — this file enforces it.
//
// CORRECTNESS: consistency alone is worth little, because all copies can be
// wrong together — an edit that widened `img-src` everywhere would keep them
// perfectly identical. So the effective image policy is asserted against the
// property #68 cares about (tenant markdown must not be able to reach an
// attacker's host) rather than against a golden string.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const nginxConf = readFileSync(path.join(repoRoot, 'nginx.conf'), 'utf8');
const vercelJson = JSON.parse(readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));

/** Headers every response must carry, whichever block ends up serving it. */
const REQUIRED_HEADERS = [
  'X-Frame-Options',
  'X-Content-Type-Options',
  'X-XSS-Protection',
  'Referrer-Policy',
  'Content-Security-Policy',
] as const;

/**
 * CSP source expressions that cannot cause a network fetch. Anything else — a
 * host, `*`, or a bare `http:`/`https:` scheme — can, and so re-opens #68.
 */
const NON_NETWORK_SOURCES = new Set(["'self'", "'none'", 'data:', 'blob:']);

const stripComments = (s: string) => s.split('\n').map((l) => l.replace(/#.*$/, '')).join('\n');

interface Scope {
  label: string;
  body: string;
}

/** Brace-matched `location` blocks, plus the server scope with them removed. */
function nginxScopes(conf: string): Scope[] {
  const src = stripComments(conf);
  const locations: Array<Scope & { start: number; end: number }> = [];
  const re = /location\s+([^{]+?)\s*\{/g;

  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') depth -= 1;
      i += 1;
    }
    locations.push({
      label: `location ${m[1].trim()}`,
      body: src.slice(bodyStart, i - 1),
      start: m.index,
      end: i,
    });
  }

  let serverScope = '';
  let cursor = 0;
  for (const loc of locations) {
    serverScope += src.slice(cursor, loc.start);
    cursor = loc.end;
  }
  serverScope += src.slice(cursor);

  return [{ label: 'server (top level)', body: serverScope }, ...locations];
}

/** `add_header Name "value";` occurrences within one scope. */
function declaredHeaders(body: string): Map<string, string> {
  const found = new Map<string, string>();
  const re = /add_header\s+(\S+)\s+"([^"]*)"/g;
  for (let m = re.exec(body); m !== null; m = re.exec(body)) {
    found.set(m[1].toLowerCase(), m[2]);
  }
  return found;
}

/**
 * The source list that actually governs images: `img-src` when present, else
 * the `default-src` fallback. A policy with neither is unrestricted, so it is
 * reported as `*` and fails — the absence of a directive must not read as safe.
 */
function effectiveImageSources(csp: string): string[] {
  const directives = new Map<string, string[]>();
  for (const clause of csp.split(';')) {
    const parts = clause.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const name = parts[0].toLowerCase();
    // FIRST occurrence wins. Per CSP, a directive repeated within one policy is
    // ignored after its first appearance — so a policy reading
    // `img-src *; … img-src 'self' data:;` is enforced as `img-src *`. Keeping
    // the last would have read that as safe while every browser allowed the
    // remote fetch, which is the exact exposure this file exists to catch.
    if (directives.has(name)) continue;
    directives.set(name, parts.slice(1));
  }
  return directives.get('img-src') ?? directives.get('default-src') ?? ['*'];
}

const scopes = nginxScopes(nginxConf);

type VercelRule = { source: string; headers: Array<{ key: string; value: string }> };

const vercelRules = vercelJson.headers as VercelRule[];

/**
 * EVERY Vercel rule that sets a CSP, not just the first. A rule appended later
 * and scoped to a subset of routes (say, the case pages) would otherwise never
 * be looked at — and that is the one place a narrowly-targeted widening would
 * be easiest to slip in.
 */
const vercelPolicies = vercelRules.flatMap((rule) =>
  rule.headers
    // EVERY CSP entry in the rule, not just the first. A rule listing the key
    // twice — safe value first, permissive second — would otherwise be read
    // through the safe one alone. Which value Vercel actually applies is not
    // something this repo can settle, so the guard requires all of them to be
    // acceptable rather than betting on the resolution order.
    .filter((h) => h.key.toLowerCase() === 'content-security-policy')
    .map((h, i) => ({
      label: `vercel.json [${rule.source}]${i > 0 ? ` #${i + 1}` : ''}`,
      csp: h.value,
    })),
);

const vercelHeaderRule = vercelRules.find((rule) =>
  rule.headers.some((h) => h.key.toLowerCase() === 'content-security-policy'),
);

// The parser decides what "the policy allows" means, so it is tested against
// browser semantics directly rather than only through the configs it reads.
describe('CSP policy parsing', () => {
  it('takes the FIRST occurrence of a repeated directive, as browsers do', () => {
    expect(effectiveImageSources("img-src *; img-src 'self' data:;")).toEqual(['*']);
    expect(effectiveImageSources("img-src 'self'; img-src *;")).toEqual(["'self'"]);
  });

  it('falls back to default-src only when img-src is absent', () => {
    expect(effectiveImageSources("default-src 'self'; script-src 'self';")).toEqual(["'self'"]);
    expect(effectiveImageSources("default-src *; img-src 'self';")).toEqual(["'self'"]);
  });

  it('treats a policy governing images by nothing at all as unrestricted', () => {
    expect(effectiveImageSources("script-src 'self';")).toEqual(['*']);
    expect(effectiveImageSources('')).toEqual(['*']);
  });

  it('is case- and whitespace-insensitive about directive names', () => {
    expect(effectiveImageSources("  IMG-SRC   'self'   data:  ;")).toEqual(["'self'", 'data:']);
  });
});

describe('nginx security headers', () => {
  it('finds the server scope and every location block', () => {
    // Guards the parser itself: if this drifts to 0 locations, every
    // per-location assertion below would pass vacuously.
    expect(scopes.length).toBeGreaterThanOrEqual(5);
    expect(scopes.map((s) => s.label)).toContain('server (top level)');
  });

  // add_header is not additive — each scope must re-declare the whole set.
  describe.each(scopes)('$label', ({ body }) => {
    it.each(REQUIRED_HEADERS)('declares %s', (header) => {
      expect(declaredHeaders(body).has(header.toLowerCase())).toBe(true);
    });
  });
});

describe('Content-Security-Policy', () => {
  const nginxPolicies = scopes.map((s) => ({
    label: s.label,
    csp: declaredHeaders(s.body).get('content-security-policy'),
  }));

  it('is byte-identical everywhere nginx declares it', () => {
    const distinct = new Set(nginxPolicies.map((p) => p.csp));
    expect([...distinct]).toHaveLength(1);
  });

  it('matches the policy Vercel serves, on every rule that sets one', () => {
    expect(vercelPolicies.length).toBeGreaterThan(0);
    for (const { label, csp } of vercelPolicies) {
      expect(`${label}: ${csp}`).toBe(`${label}: ${nginxPolicies[0].csp}`);
    }
  });

  it('has Vercel declaring the same required header set as nginx', () => {
    const keys = new Set(vercelHeaderRule?.headers.map((h) => h.key.toLowerCase()));
    for (const header of REQUIRED_HEADERS) {
      expect(keys.has(header.toLowerCase())).toBe(true);
    }
  });

  // #68: case markdown is authored by tenants and rendered by operators across
  // a trust boundary. `![](https://attacker.example/pixel.png)` survives
  // react-markdown's URL transform, so the policy is what stops the browser
  // fetching it and disclosing when support opened the case, and from where.
  describe.each(
    [...nginxPolicies, ...vercelPolicies].filter(
      (p): p is { label: string; csp: string } => typeof p.csp === 'string',
    ),
  )('$label', ({ csp }) => {
    it('permits no image source that can reach the network', () => {
      const offending = effectiveImageSources(csp).filter((s) => !NON_NETWORK_SOURCES.has(s));
      expect(offending).toEqual([]);
    });
  });
});
