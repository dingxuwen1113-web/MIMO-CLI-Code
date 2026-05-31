# syntax=docker/dockerfile:1
# =============================================================================
# MIMO CLI Code - Multi-stage Docker Build
# =============================================================================
# Stage 1: Build TypeScript source
# Stage 2: Production runtime with optional Playwright support
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, etc.)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Copy dependency manifests first for optimal layer caching
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies for TypeScript build)
RUN npm ci --ignore-scripts && \
    npm rebuild

# Copy source code and configuration
COPY tsconfig.json ./
COPY src/ ./src/
COPY config/ ./config/
COPY agents/ ./agents/
COPY locales/ ./locales/
COPY skills/ ./skills/

# Build TypeScript to JavaScript
RUN npm run build

# Prune devDependencies after build
RUN npm prune --production

# ---------------------------------------------------------------------------
# Stage 2: Production Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

# Metadata labels
LABEL maintainer="MIMO Team <mimo@example.com>"
LABEL org.opencontainers.image.title="MIMO CLI Code"
LABEL org.opencontainers.image.description="AI-powered coding agent by Xiaomi"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/anthropics/mimo-cli-code"
LABEL org.opencontainers.image.licenses="MIT"

# ---------------------------------------------------------------------------
# System dependencies
# ---------------------------------------------------------------------------
RUN apk add --no-cache \
    git \
    ripgrep \
    openssh-client \
    python3 \
    py3-pip \
    curl \
    ca-certificates \
    bash \
    shadow \
    tini \
    # better-sqlite3 runtime deps
    libstdc++

# ---------------------------------------------------------------------------
# s6-overlay for process supervision (lightweight init)
# ---------------------------------------------------------------------------
ARG S6_OVERLAY_VERSION=3.2.0.2
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp/
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz && rm /tmp/s6-overlay-noarch.tar.xz
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz /tmp/
RUN tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz && rm /tmp/s6-overlay-x86_64.tar.xz

# ---------------------------------------------------------------------------
# Non-root user setup
# ---------------------------------------------------------------------------
ARG MIMO_UID=1000
ARG MIMO_GID=1000

RUN addgroup -g ${MIMO_GID} mimo && \
    adduser -u ${MIMO_UID} -G mimo -s /bin/bash -D mimo

# Create application directories
RUN mkdir -p /app /home/mimo/.mimo /workspace && \
    chown -R mimo:mimo /app /home/mimo/.mimo /workspace

WORKDIR /app

# ---------------------------------------------------------------------------
# Copy built artifacts from builder stage
# ---------------------------------------------------------------------------
COPY --from=builder --chown=mimo:mimo /app/dist ./dist
COPY --from=builder --chown=mimo:mimo /app/node_modules ./node_modules
COPY --from=builder --chown=mimo:mimo /app/package.json ./package.json
COPY --from=builder --chown=mimo:mimo /app/config ./config
COPY --from=builder --chown=mimo:mimo /app/agents ./agents
COPY --from=builder --chown=mimo:mimo /app/locales ./locales
COPY --from=builder --chown=mimo:mimo /app/skills ./skills

# ---------------------------------------------------------------------------
# Optional: Install Playwright browsers (set INSTALL_PLAYWRIGHT=true at build)
# ---------------------------------------------------------------------------
ARG INSTALL_PLAYWRIGHT=false
RUN if [ "$INSTALL_PLAYWRIGHT" = "true" ]; then \
        npx playwright install --with-deps chromium && \
        npx playwright install-deps chromium; \
    fi

# ---------------------------------------------------------------------------
# s6-overlay service definitions
# ---------------------------------------------------------------------------
RUN mkdir -p /etc/s6-overlay/s6-rc.d/mimo /etc/s6-overlay/scripts && \
    printf '#!/command/execlineb -P\ns6-setuidgid mimo\nnode /app/dist/index.js\n' \
      > /etc/s6-overlay/s6-rc.d/mimo/run && \
    printf 'longrun\n' \
      > /etc/s6-overlay/s6-rc.d/mimo/type && \
    mkdir -p /etc/s6-overlay/s6-rc.d/user/contents.d && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/mimo && \
    chmod +x /etc/s6-overlay/s6-rc.d/mimo/run

# ---------------------------------------------------------------------------
# Environment defaults
# ---------------------------------------------------------------------------
ENV NODE_ENV=production \
    MIMO_HOME=/home/mimo/.mimo \
    MIMO_WORKSPACE=/workspace \
    MIMO_API_HOST=0.0.0.0 \
    MIMO_API_PORT=9120 \
    MIMO_DASHBOARD_PORT=9119 \
    MIMO_LOG_LEVEL=info \
    NODE_OPTIONS="--max-old-space-size=2048" \
    PYTHONUNBUFFERED=1

# ---------------------------------------------------------------------------
# Expose ports
# ---------------------------------------------------------------------------
EXPOSE 9120 9119

# ---------------------------------------------------------------------------
# Volumes
# ---------------------------------------------------------------------------
VOLUME ["/home/mimo/.mimo", "/workspace"]

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -sf http://localhost:${MIMO_API_PORT}/health || exit 1

# ---------------------------------------------------------------------------
# Switch to non-root user
# ---------------------------------------------------------------------------
USER mimo

# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
