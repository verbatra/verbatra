# syntax=docker/dockerfile:1

# Base image is pinned by digest to a specific Node 24 LTS patch release. The digest is the
# OCI image index (manifest list) for the tag, not a single-architecture image manifest, so
# the daemon still resolves the entry matching the build platform: amd64, arm64/v8, and
# ppc64le are the platforms this index carries, and the build/runtime arch still matches
# (sharp's native binary is traced into the bundle). The tag is kept alongside the digest for
# readability; the digest is what actually resolves. Update both together.

# ---- Builder ----
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS builder
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app

# Enable the pinned pnpm from package.json's packageManager field.
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate

# The build context is the repository root; .dockerignore keeps it lean.
COPY . .

# Install only what @verbatra/docs needs, against the committed lockfile.
RUN pnpm install --frozen-lockfile --filter @verbatra/docs...

# Build the standalone output (emits apps/docs/.next/standalone). The trailing "..." builds
# @verbatra/docs together with its workspace dependencies (sdk, cli, …) in topological order,
# so their dist/ + type declarations exist before Next type-checks verbatra.config.ts, which
# imports @verbatra/sdk.
RUN pnpm --filter @verbatra/docs... build

# ---- Runner ----
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
USER node

# The standalone tree carries the server and the traced pnpm store; copy it wholesale so
# the relative node_modules symlinks stay intact.
COPY --from=builder --chown=node:node /app/apps/docs/.next/standalone ./
# Static assets live outside the standalone tree; place them where server.js expects them.
COPY --from=builder --chown=node:node /app/apps/docs/.next/static ./apps/docs/.next/static
COPY --from=builder --chown=node:node /app/apps/docs/public ./apps/docs/public

EXPOSE 3000

# Liveness probe using Node's built-in fetch; no extra packages are needed in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# outputFileTracingRoot is the repo root, so the server entry sits under apps/docs.
CMD ["node", "apps/docs/server.js"]
