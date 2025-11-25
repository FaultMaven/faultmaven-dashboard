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

# Build the application
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL:-https://api.faultmaven.ai}

RUN pnpm build

# Stage 2: Production
FROM nginx:alpine

# Build args for CSP configuration
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL:-https://api.faultmaven.ai}

# Copy custom nginx config template and substitute VITE_API_URL_HOST
COPY nginx.conf /tmp/nginx.conf.template
RUN sed "s|VITE_API_URL_HOST|${VITE_API_URL}|g" /tmp/nginx.conf.template > /etc/nginx/conf.d/default.conf && \
    rm /tmp/nginx.conf.template

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
