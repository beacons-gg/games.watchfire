# Watchfire

A BBS-style door game on [Beacon](https://beacons.gg). Fires burn at real places; keep them alive with three logs a day. Play in a terminal locally, or over `ssh`. A read-only dashboard shows the world's fires live.

Start with [docs/README.md](docs/README.md).

## Develop

```sh
nvm use
pnpm install          # @beaconsgg/* comes from registry.example.com (see .npmrc)
pnpm typecheck
pnpm test
pnpm play             # the game, on 9q72.beacons.gg: this is real play, everyone sees your fires
# Testing only: fires of another room type, invisible to everyone playing normally.
# Don't hand this to playtesters, or their fires won't show up for anyone else.
WATCHFIRE_FIRE_TYPE=watchfire-dev pnpm play
pnpm build            # apps/cli/dist/watchfire.mjs, one self-contained file
pnpm door             # the SSH door on :2222; then: ssh -p 2222 localhost
pnpm spike            # play one fire, lit to ash, on 9q72.beacons.gg (about a minute)
pnpm spike:profile    # set a name from Watchfire and check the rest of the profile survives

# Two local Beacon servers (members-only and Edinburgh-only) for multi-server work.
# BEACON_IMAGE must be a Beacon 1.1 server image you can pull.
BEACON_IMAGE=registry.example.com/beacon-server:v1.1.0 pnpm servers:up
pnpm spike:servers    # light targets, choosing a server, watch mode, ask to join and get let in
node scripts/local-operator.ts pending | approve <did>   # play the operator
pnpm servers:down
BEACON=http://localhost:3001 pnpm spike   # or against a local Docker server
```

City names come from [GeoNames](https://www.geonames.org) (CC BY 4.0).
