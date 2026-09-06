# Multi-stage build for FaultMaven Dashboard

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm@9 && \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application with placeholder config
# Actual API URL will be injected at runtime via inject-config.sh
RUN pnpm build

# Stage 2: Production
FROM nginx:alpine

# Update Alpine packages to fix security vulnerabilities.
# The explicit version floors pull the fixes AND change this layer's cache key
# so `apk upgrade` re-runs against the current package index instead of serving
# a stale cached layer:
#   - libxml2>=2.13.9-r1  → CVE-2026-6732
#   - libcrypto3/libssl3>=3.5.8-r0 → CVE-2026-45447 (openssl PKCS7_verify UAF)
#                                    and CVE-2026-14456 (openssl QUIC server
#                                    unbounded memory growth → DoS)
#   - libexpat>=2.8.1-r0  → CVE-2026-45186 (expat DoS via crafted XML)
#   - c-ares>=1.34.8-r0   → CVE-2026-33630 (c-ares UAF/double-free in query-completion handling)
#   - libuuid>=2.42.3-r1  → the util-linux HIGH set: CVE-2026-53612/53613 (mount
#                           TOCTOU), CVE-2026-53614 (SUID mount bypasses
#                           nosuid/noexec), CVE-2026-76642 (failed external mount
#                           helper still runs privileged X-mount post-hooks),
#                           CVE-2026-78408 (nsenter --join-cgroup leaks root
#                           cgroup migration authority), CVE-2026-78409/78410
#                           (X-mount.subdir escape via intermediate symlinks;
#                           restricted bind mounts do not pin the source).
#                           libuuid is the only util-linux package in this image.
RUN apk update && apk upgrade --no-cache \
    && apk add --no-cache "libxml2>=2.13.9-r1" "libcrypto3>=3.5.8-r0" "libssl3>=3.5.8-r0" "libexpat>=2.8.1-r0" "c-ares>=1.34.8-r0" "libuuid>=2.42.3-r1"

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
