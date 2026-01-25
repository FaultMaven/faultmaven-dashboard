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

# Update Alpine packages to fix security vulnerabilities
RUN apk update && apk upgrade --no-cache

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
