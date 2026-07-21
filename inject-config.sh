#!/bin/sh
# inject-config.sh
# Injects runtime environment variables into the built application
# This script is executed by nginx's docker-entrypoint.d mechanism

set -e

# The dashboard reads window.ENV.API_URL (see src/config.ts). The KEY's presence
# is meaningful, so we only emit it when VITE_API_URL is explicitly set:
#
#   - VITE_API_URL unset      → window.ENV = {} (no key). The app uses same-host
#                               detection: API on the host that served the
#                               dashboard at :8090. The self-hosted default; works
#                               for localhost AND LAN IPs with zero config.
#   - VITE_API_URL=""         → window.ENV = { API_URL: "" }. Same-origin model:
#                               the app makes relative /api/v1/... calls, for cloud
#                               deployments where /api/* is reverse-proxied to the
#                               backend behind the same hostname.
#   - VITE_API_URL=https://…  → window.ENV = { API_URL: "https://…" }. Absolute
#                               origin for split-host deployments.
#
# Note: API_URL must be an origin (scheme://host[:port]) or ""; never a path like
# "/api" — the app already appends "/api/v1/...", so a path prefix would double it.
#
# SECURITY: the value is written verbatim into a JS string literal below. A value
# containing a double-quote, backslash, or newline could break out of the string
# and execute arbitrary JS in every user's session. We therefore validate that a
# SET, non-empty value is a bare origin (scheme://host[:port]) — a character set
# that cannot escape the string — and refuse to inject anything else.
echo "Injecting runtime configuration..."

# POSIX-safe origin check: http/https scheme, host of [A-Za-z0-9._-], optional
# :port of 1-5 digits, and nothing else. Anchored, so no path/query/fragment and
# no quote/backslash/whitespace can slip through. `printf %s` avoids a trailing
# newline that would otherwise defeat the `$` anchor.
is_valid_origin() {
  printf '%s' "$1" | grep -Eq '^https?://[A-Za-z0-9._-]+(:[0-9]{1,5})?$'
}

if [ -n "${VITE_API_URL+x}" ]; then
  # SET (possibly empty).
  if [ -z "${VITE_API_URL}" ]; then
    : # Empty string is allowed — same-origin (relative /api/v1/...) model.
  elif ! is_valid_origin "${VITE_API_URL}"; then
    echo "ERROR: VITE_API_URL is not a valid origin (scheme://host[:port]) or empty." >&2
    echo "  Got: '${VITE_API_URL}'" >&2
    echo "  Refusing to inject — a malformed value could break out of the JS string." >&2
    exit 1
  fi

  echo "  API_URL: \"${VITE_API_URL}\" (explicit)"
  cat > /usr/share/nginx/html/config.js <<EOF
// Runtime configuration injected at container startup
// DO NOT EDIT - This file is auto-generated
window.ENV = {
  API_URL: "${VITE_API_URL}"
};
EOF
else
  # UNSET — omit the key so the app falls back to same-host detection.
  echo "  API_URL: (unset — using same-host detection)"
  cat > /usr/share/nginx/html/config.js <<EOF
// Runtime configuration injected at container startup
// DO NOT EDIT - This file is auto-generated
window.ENV = {};
EOF
fi

echo "Configuration injected successfully"
