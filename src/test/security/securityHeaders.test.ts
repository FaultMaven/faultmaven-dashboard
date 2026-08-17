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

interface DeclaredHeader {
  value: string;
  /**
   * Whether the directive carries nginx's `always` flag.
   *
   * Without it nginx applies `add_header` only to a narrow set of success-ish
   * statuses, so the header is silently dropped on every 4xx/5xx from that
   * scope. That is not hypothetical: the hashed-asset location genuinely 404s
   * after a redeploy, and an error page carrying no CSP is exactly where the
   * policy still needs to hold.
   */
  always: boolean;
}

/** `add_header Name "value" [always];` occurrences within one scope. */
function declaredHeaders(body: string): Map<string, DeclaredHeader> {
  const found = new Map<string, DeclaredHeader>();
  const re = /add_header\s+(\S+)\s+"([^"]*)"([^;]*);/g;
  for (let m = re.exec(body); m !== null; m = re.exec(body)) {
    found.set(m[1].toLowerCase(), {
      value: m[2],
      always: /\balways\b/.test(m[3]),
    });
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

/**
 * Every rule that sets a CSP — each one is treated as a security-header rule
 * and must carry the whole set.
 *
 * Checking only the first let a narrow rule inserted ahead of the site-wide one
 * satisfy the guard while the site-wide rule quietly lost a header. Vercel
 * would merge them and the narrow rule covers only its own routes, so the loss
 * ships everywhere else. Requiring the full set on each is slightly stricter
 * than Vercel demands, and matches the discipline nginx is already held to.
 */
const vercelSecurityRules = vercelRules.filter((rule) =>
  rule.headers.some((h) => h.key.toLowerCase() === 'content-security-policy'),
);

/**
 * Vercel `source` patterns known to match the bare root path `/`.
 *
 * Coverage is asserted against this allowlist rather than by re-implementing
 * path-to-regexp, so an unrecognised pattern reads as NOT covering root. That
 * direction matters: the failure this guards against is a rule that looks
 * site-wide but silently misses `/`, and a permissive matcher would wave
 * exactly that through.
 *
 * `/:path*` is deliberately absent. It looks site-wide and is not: verified
 * live against the deployed dashboard, where `/` came back with none of the
 * security headers while `/cases`, `/index.html` and `/config.js` came back
 * with all of them.
 */
const ROOT_MATCHING_SOURCES = new Set(['/', '/(.*)', '/(.*)?']);

const matchesRoot = (source: string) => ROOT_MATCHING_SOURCES.has(source.trim());

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
      const declared = declaredHeaders(body).get(header.toLowerCase());
      expect(declared, `${header} is not declared in this scope`).toBeDefined();
      // A header without `always` is absent from every error response this
      // scope produces, which is not a weaker version of the guarantee — it is
      // no guarantee on exactly the responses that matter.
      expect(declared?.always, `${header} is declared without the 'always' flag`).toBe(true);
    });
  });
});

describe('Content-Security-Policy', () => {
  const nginxPolicies = scopes.map((s) => ({
    label: s.label,
    csp: declaredHeaders(s.body).get('content-security-policy')?.value,
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

  // A correct policy that never reaches the document protects nothing. This is
  // a single-document SPA: the browser loads `/` once and every later route is
  // client-side, so the headers on `/` govern the whole session. A rule that
  // covers `/cases` but not `/` therefore protects only the rarer deep-link
  // entry, while the ordinary visit runs unprotected.
  it('applies the security headers at the site root, not just below it', () => {
    expect(vercelSecurityRules.length).toBeGreaterThan(0);
    const covering = vercelSecurityRules.filter((rule) => matchesRoot(rule.source));
    expect(
      covering.map((r) => r.source),
      'no CSP-bearing vercel.json rule matches "/", so the document a user ' +
        'actually loads is served without security headers',
    ).not.toEqual([]);
  });

  it('has every CSP-bearing Vercel rule declaring the same required set as nginx', () => {
    expect(vercelSecurityRules.length).toBeGreaterThan(0);
    for (const rule of vercelSecurityRules) {
      const keys = new Set(rule.headers.map((h) => h.key.toLowerCase()));
      for (const header of REQUIRED_HEADERS) {
        expect(keys.has(header.toLowerCase()), `${rule.source} is missing ${header}`).toBe(true);
      }
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
