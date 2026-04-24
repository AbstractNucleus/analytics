# syntax=docker/dockerfile:1.7
# Base image: node:20-alpine (Node 20 LTS, Alpine for small footprint).
# Package manager: pnpm@10.33.2 (must match app/package.json "packageManager").
# Multi-stage: deps -> build -> runtime. Runtime copies only the adapter-node
# output and a pruned production node_modules, and runs as the unprivileged
# `node` user.

ARG NODE_IMAGE=node:20-alpine
ARG PNPM_VERSION=10.33.2

# ---- deps ----------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
ARG PNPM_VERSION
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build ---------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- prod deps (pruned) --------------------------------------------------
# Separate stage so the runtime layer never sees devDependencies.
FROM ${NODE_IMAGE} AS prod-deps
ARG PNPM_VERSION
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# ---- runtime -------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
EXPOSE 3000
USER node
CMD ["node", "build"]
