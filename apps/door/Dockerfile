# syntax=docker/dockerfile:1.7
#
# The Watchfire SSH door. Build from the repo root; the @beaconsgg packages come from a private
# registry, so the build borrows your npm credentials as a secret (never stored in the image):
#
#   docker build -f apps/door/Dockerfile --secret id=npmrc,src=$HOME/.npmrc -t watchfire-door .
#
# or `docker compose build` with compose.yaml. The image runs one bundled file on Node: no
# node_modules, no registry access at run time.

# --- build: install, bundle the door into one file, build the website -----------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/core/package.json packages/core/
COPY apps/cli/package.json apps/cli/
COPY apps/door/package.json apps/door/
COPY apps/dashboard/package.json apps/dashboard/
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm -C apps/door run build && pnpm -C apps/dashboard run build

# --- run ------------------------------------------------------------------------------------
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    FORCE_COLOR=3 \
    TZ=UTC \
    WATCHFIRE_DOOR_HOME=/data \
    WATCHFIRE_DOOR_PORT=2222 \
    WATCHFIRE_WEB_ROOT=/app/web
WORKDIR /app
COPY --from=build /src/apps/door/dist/ ./
COPY --from=build /src/apps/dashboard/dist/ ./web/
# The door keeps its data in Postgres (WATCHFIRE_DOOR_DATABASE_URL), or else in files in /data,
# a volume, so a plain `docker run` doesn't lose its keepers with the container.
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
# 2222: the game, over ssh. 8080: the website (the game explained, and its world live).
EXPOSE 2222 8080
# Is it taking calls? On the ssh port, or the website's when it runs alone (WATCHFIRE_DOOR_PORT=0).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "door.mjs", "health"]
CMD ["node", "door.mjs"]
