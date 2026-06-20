#!/bin/sh
# inject-config.sh
# Injects runtime environment variables into the built application
# This script is executed by nginx's docker-entrypoint.d mechanism

set -e

# API_URL is set ONLY when explicitly provided (split-host deployments where the
# API lives on a different host than the dashboard). When unset we inject an empty
# value so the app falls back to same-host detection in src/config.ts — i.e. the
# backend is assumed to be on the host that served the dashboard (port 8090).
# This avoids hardcoding a loopback default (localhost/127.0.0.1), which breaks
# when the dashboard is reached over a LAN IP such as http://192.168.0.200:3333.
API_URL="${VITE_API_URL:-}"

echo "Injecting runtime configuration..."
if [ -n "${API_URL}" ]; then
  echo "  API_URL: ${API_URL} (explicit override)"
else
  echo "  API_URL: (unset — using same-host detection)"
fi

# Create runtime config JavaScript file
cat > /usr/share/nginx/html/config.js <<EOF
// Runtime configuration injected at container startup
// DO NOT EDIT - This file is auto-generated
window.ENV = {
  API_URL: "${API_URL}"
};
EOF

echo "Configuration injected successfully"
