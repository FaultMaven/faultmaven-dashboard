# Multi-stage build for FaultMaven Dashboard

# Stage 1: Build
# The Node major is package.json's `engines.node`. FROM cannot read a file, so
# scripts/check-toolchain-pins.mjs fails CI when the two differ.
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install the pnpm package.json's `packageManager` names, then dependencies
RUN npm install -g "$(node -p "require('./package.json').packageManager")" && \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application with placeholder config
# Actual API URL will be injected at runtime via inject-config.sh
RUN pnpm build

# Stage 2: Production
FROM nginx:alpine

# Upgrade every Alpine package to its current release, so a fix Alpine ships
# reaches the next build without an edit here (#236). BuildKit keys this layer
# on the base digest, this RUN's text and the ARG values in scope. The first
# two stay the same for weeks, so CI passes PKG_REFRESH, a value per CI run:
# without it, the GitHub Actions cache (cache-from: type=gha) restores the
# layer from whichever run built it first. A build without the arg (a local
# one) keeps its cached layer until its base image changes, and no edit here
# refreshes it any more: `--build-arg PKG_REFRESH=$(date +%s)` does.
#
# --no-cache reads the index into memory, so no APKINDEX ships in the image.
# apk stops (exit 99) when it cannot read a repository's index, so an
# unreachable mirror fails the build. Trivy, in CI and before each publish,
# fails a build that carries a fixed HIGH or CRITICAL CVE.
ARG PKG_REFRESH
RUN apk upgrade --no-cache

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy runtime config injection script
COPY inject-config.sh /docker-entrypoint.d/40-inject-config.sh
RUN chmod +x /docker-entrypoint.d/40-inject-config.sh

# Add healthcheck - use /health endpoint with BusyBox wget (use 127.0.0.1 for DNS-less resolution)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 -O /dev/null http://127.0.0.1:80/health || exit 1

EXPOSE 80

# nginx:alpine image runs scripts in /docker-entrypoint.d/ before starting nginx
CMD ["nginx", "-g", "daemon off;"]
