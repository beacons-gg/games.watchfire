# syntax=docker/dockerfile:1.7
#
# The Watchfire SSH door. Build from the repo root; the @beaconsgg packages come from a private
# registry, so the build borrows your npm credentials as a secret (never stored in the image):
#
#   docker build -f apps/door/Dockerfile --secret id=npmrc,src=$HOME/.npmrc -t watchfire-door .
#
# or `docker compose build` with compose.yaml. The image runs one bundled file on Node: no
# node_modules, no registry access at run time.

# --- build: install, bundle the door into one file ---------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/core/package.json packages/core/
COPY apps/cli/package.json apps/cli/
COPY apps/door/package.json apps/door/
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm -C apps/door run build

# --- run ------------------------------------------------------------------------------------
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    FORCE_COLOR=3 \
    TZ=UTC \
    WATCHFIRE_DOOR_HOME=/data \
    WATCHFIRE_DOOR_PORT=2222
WORKDIR /app
COPY --from=build /src/apps/door/dist/ ./
# /data holds the host key, the keepers and (unless given another way) the master key.
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 2222
# Is it taking calls? A plain TCP connect (the door doesn't log callers who never sign in).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "require('net').connect(process.env.WATCHFIRE_DOOR_PORT,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"]
CMD ["node", "door.mjs"]
