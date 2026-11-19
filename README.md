# Watchfire

A BBS-style door game on [Beacon](https://beacons.gg). Fires burn at real places; keep them alive with three logs a day. Play in a terminal locally, or over `ssh`. A read-only dashboard shows the world's fires live.

Start with [docs/README.md](docs/README.md).

## Develop

```sh
nvm use
pnpm install          # @beaconsgg/* comes from registry.example.com (see .npmrc)
pnpm typecheck
pnpm test
pnpm play             # the game, on 9q72.beacons.gg
WATCHFIRE_FIRE_TYPE=watchfire-dev pnpm play   # same, with test fires kept apart from real ones
pnpm build            # apps/cli/dist/watchfire.mjs, one self-contained file
pnpm spike            # play one fire, lit to ash, on 9q72.beacons.gg (about a minute)
pnpm spike:profile    # set a name from Watchfire and check the rest of the profile survives
BEACON=http://localhost:3001 pnpm spike   # or against a local Docker server
```

City names come from [GeoNames](https://www.geonames.org) (CC BY 4.0).
