#!/bin/sh
# inject-config.sh
# Injects runtime environment variables into the built application
# This script is executed by nginx's docker-entrypoint.d mechanism

set -e

# Default values
API_URL="${VITE_API_URL:-http://localhost:8090}"

echo "Injecting runtime configuration..."
echo "  API_URL: ${API_URL}"

# Create runtime config JavaScript file
cat > /usr/share/nginx/html/config.js <<EOF
// Runtime configuration injected at container startup
// DO NOT EDIT - This file is auto-generated
window.ENV = {
  API_URL: "${API_URL}"
};
EOF

echo "Configuration injected successfully"
