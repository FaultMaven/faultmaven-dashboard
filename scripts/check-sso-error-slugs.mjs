#!/usr/bin/env node
/**
 * Fail if src/lib/auth/ssoErrors.ts does not handle exactly the SSO error slugs
 * the backend can emit.
 *
 * These slugs ride a 302 as `?error=` query params, so they appear nowhere in
 * openapi.json and `api-types-drift` is structurally blind to them. Nothing
 * connected the two sides: faultmaven#869 added `sso_org_unmapped` six days
 * after the callback page shipped, and the dashboard told every affected user
 * to "try again" — the one SSO failure retrying can never fix — until
 * faultmaven-dashboard#79.
 *
 * The backend's `_dashboard_redirect()` is the single writer of that param and
 * its `ERROR_*` module constants are the whole domain, so those constants are
 * the oracle. This reads them from faultmaven `main` — the same live-from-main
 * choice `generate:api-types` makes, and for the same reason: pinning a ref
 * stops unrelated PRs going red but recreates a lock that nothing forces anyone
 * to bump. Red-on-contract-change IS the signal.
 *
 *   pnpm check:sso-slugs                          # against faultmaven main
 *   pnpm check:sso-slugs --source ../faultmaven   # against a local checkout
 *   FM_BACKEND_SOURCE=... pnpm check:sso-slugs    # POSIX shells, and CI
 *
 * Every failure to *read* either side is an error, never a pass. A gate that
 * treats an unreachable oracle or an unparsable file as "no differences found"
 * reports success for the state it exists to detect.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_PATH =
  "faultmaven/modules/auth/domain/services/sso_login_service.py";
const DEFAULT_SOURCE = `https://raw.githubusercontent.com/FaultMaven/faultmaven/main/${SERVICE_PATH}`;

const USAGE =
  "usage: node scripts/check-sso-error-slugs.mjs [--source <faultmaven-checkout-or-url>]";

// Unrecognised arguments are rejected rather than ignored, so a typo cannot
// silently check `main` while the developer believes they are checking their
// branch — the same trap `--spec=` fell into in generate-api-types.mjs.
function parseSource(argv) {
  let source;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") {
      source = argv[i + 1];
      if (!source) {
        console.error(`--source needs a path or URL\n${USAGE}`);
        process.exit(1);
      }
      i += 1;
    } else if (arg.startsWith("--source=")) {
      source = arg.slice("--source=".length);
      if (!source) {
        console.error(`--source needs a path or URL\n${USAGE}`);
        process.exit(1);
      }
    } else {
      console.error(`unrecognised argument: ${arg}\n${USAGE}`);
      process.exit(1);
    }
  }
  return source;
}

/** Resolve a bare checkout path to the service file inside it; leave URLs and direct file paths alone. */
function resolveSource(source) {
  if (/^https?:\/\//.test(source)) return source;
  return source.endsWith(".py") ? source : path.join(source, SERVICE_PATH);
}

async function readSource(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`GET ${source} returned ${res.status} ${res.statusText}`);
    }
    return res.text();
  }
  return readFile(source, "utf8");
}

/**
 * The backend's slug constants: `ERROR_<NAME> = "sso_<slug>"` at module level.
 *
 * Anchored to the start of a line so an indented occurrence inside a function
 * or docstring cannot contribute, and the value is required to look like a slug
 * so a renamed-but-unassigned constant does not slip through as an empty match.
 */
function parseBackendSlugs(python) {
  return new Set(
    [...python.matchAll(/^ERROR_[A-Z0-9_]+\s*=\s*["'](sso_[a-z0-9_]+)["']/gm)].map((m) => m[1])
  );
}

/**
 * The keys of ERROR_MESSAGES in ssoErrors.ts.
 *
 * Scoped to that object literal rather than the whole file so a slug named in a
 * comment elsewhere cannot register as handled. Comment lines inside the block
 * start with `//` and so never match the key pattern.
 */
function parseHandledSlugs(ts) {
  const open = ts.indexOf("ERROR_MESSAGES: Record<string, string> = {");
  if (open === -1) return null;
  const close = ts.indexOf("\n};", open);
  if (close === -1) return null;
  const body = ts.slice(open, close);
  return new Set([...body.matchAll(/^\s{2}(sso_[a-z0-9_]+):/gm)].map((m) => m[1]));
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const handledPath = path.join(repoRoot, "src", "lib", "auth", "ssoErrors.ts");

const source = resolveSource(
  parseSource(process.argv.slice(2)) || process.env.FM_BACKEND_SOURCE || DEFAULT_SOURCE
);

let python;
try {
  python = await readSource(source);
} catch (err) {
  console.error(`::error::could not read the backend's SSO slugs from ${source}`);
  console.error(`  ${err.message}`);
  process.exit(1);
}

const backend = parseBackendSlugs(python);
if (backend.size === 0) {
  // A truncated download, an error page, or a refactor that moved the constants
  // would otherwise compare against an empty set and "pass" by matching nothing.
  console.error(`::error::found no ERROR_* slug constants in ${source}`);
  console.error("  The constants moved or the download was not the expected file.");
  console.error(`  This check must be repointed at wherever ${SERVICE_PATH} now defines them.`);
  process.exit(1);
}

const handled = parseHandledSlugs(await readFile(handledPath, "utf8"));
if (handled === null || handled.size === 0) {
  console.error("::error::could not read ERROR_MESSAGES from src/lib/auth/ssoErrors.ts");
  console.error("  The map was renamed or reshaped; update parseHandledSlugs in this script.");
  process.exit(1);
}

const missing = [...backend].filter((s) => !handled.has(s)).sort();
const extra = [...handled].filter((s) => !backend.has(s)).sort();

if (missing.length === 0 && extra.length === 0) {
  console.log(`SSO error slugs match (${backend.size}): ${[...backend].sort().join(", ")}`);
  process.exit(0);
}

console.error("::error::src/lib/auth/ssoErrors.ts does not match the backend's SSO error slugs.");
if (missing.length > 0) {
  console.error("");
  console.error(`  Emitted by the backend, unhandled here: ${missing.join(", ")}`);
  console.error("  These currently fall through to GENERIC_ERROR — 'Sign-in failed. Please");
  console.error("  try again.' — which is wrong for any failure a retry cannot fix.");
  console.error("  Add each to ERROR_MESSAGES with copy that matches what it actually means.");
}
if (extra.length > 0) {
  console.error("");
  console.error(`  Handled here, not emitted by the backend: ${extra.join(", ")}`);
  console.error("  Dead copy — the backend cannot produce these. Remove them, or fix a typo.");
}
console.error("");
console.error(`  Backend source: ${source}`);
process.exit(1);
