# Watchfire

> Somewhere in the world, a fire is about to go out. You have three logs today.

Watchfire is a BBS-style door game played in a terminal: over `ssh` with nothing to install, or locally. Fires burn at real places on the map. Every day you get three logs to keep them alive. Fires nobody tends go dark, and nobody can keep one going alone for long, so fires live because strangers chose them. A visit takes about a minute.

The game runs on [Beacon](https://beacons.gg). The fires live in Beacon rooms, and each room's policy holds the rules, so the server enforces them for everyone and Watchfire has no game backend of its own. A door (the SSH server) also serves a website that explains the game and shows the world's fires live.

## Play

Over ssh, at a door someone runs (the door's website shows its address):

```sh
ssh -p 2222 <the door's address>
```

Your ssh key is your keeper. Without a key you come in as a guest who can watch but not lay logs. The rules, the keys and how to get set up on a Mac, Windows or a phone are in [docs/how-to-play.md](docs/how-to-play.md).

On your own computer: download the game for Windows, macOS or Linux from the [releases](https://github.com/beacons-gg/watchfire/releases), unpack it and run `watchfire` in a terminal. Nothing else to install. Your keeper lives in your home folder, as with any key of yours. From a checkout: `pnpm play` (see [Develop](#develop)).

## Run a door

The door is one Docker image: the SSH game on port 2222 and the website on 8080, with its data in Postgres.

```sh
cp .env.example .env
echo "WATCHFIRE_MASTER_KEY=$(openssl rand -hex 32)" >> .env   # back this up off the host
echo "WATCHFIRE_DB_PASSWORD=$(openssl rand -hex 24)" >> .env
docker compose up -d --build
ssh -p 2222 localhost
```

Backups, Dokploy, keeping data in files, an outside database, running the website alone and the sysop's commands: [docs/deploy.md](docs/deploy.md).

## Docs

| Doc | What it covers |
| --- | --- |
| [how-to-play.md](docs/how-to-play.md) | For players: coming in over ssh, the rules, the keys |
| [vision.md](docs/vision.md) | What Watchfire is, who it's for, and why it's a terminal game |
| [game-design.md](docs/game-design.md) | The core loop, the rules and their tuning, the screens, the news, embers |
| [beacon-integration.md](docs/beacon-integration.md) | How the game maps onto Beacon: the fire policy, what the server enforces, several servers, profiles, and the gotchas |
| [architecture.md](docs/architecture.md) | The monorepo: the shared core, the CLI, the door, the website |
| [ssh-door.md](docs/ssh-door.md) | The SSH door: identity, settings, where its data lives, rate limits, bans, security |
| [deploy.md](docs/deploy.md) | Running the door in Docker or Dokploy: secrets, settings, backups, sysop commands |
| [roadmap.md](docs/roadmap.md) | What's built, what's next, and open questions |

## Develop

Node 24 through nvm, and pnpm. Everything installs from npm, Beacon's SDK (`@beaconsgg/*`) included.

```sh
nvm use
pnpm install
pnpm typecheck
pnpm test             # WATCHFIRE_TEST_DATABASE_URL=postgres://… also runs the Postgres tests
pnpm play             # the game, on 9q72.beacons.gg: real play, everyone sees your fires
WATCHFIRE_FIRE_TYPE=watchfire-dev pnpm play   # test fires, invisible to normal play
pnpm door             # the SSH door on :2222 (ssh -p 2222 localhost) and its website on :8080
pnpm dashboard        # the website with live reload on :5173, reading a running door's /api/world
pnpm build            # apps/cli/dist/watchfire.mjs (one self-contained file) and the website
```

### Releasing

Set `version` in `apps/cli/package.json`, commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`. The [release workflow](.github/workflows/release.yml) checks the tag matches, runs the tests, builds executables for Windows, macOS (Apple silicon and Intel) and Linux (x64 and ARM) with Bun, and publishes them as a GitHub release. (A job that runs each one on its own OS first is in the workflow, switched off for now.) A tag with a suffix (`v0.2.0-rc.1`) makes a pre-release. To build the same archives locally: `pnpm -C apps/cli run build && scripts/package-cli.sh 0.2.0`.

The macOS builds are ad-hoc signed, not with an Apple Developer ID, so players unblock them once (the release notes say how). Signing and notarizing is a later step.

`WATCHFIRE_FIRE_TYPE` fires are only for testing: don't hand that setting to playtesters, or their fires won't show up for anyone else.

Checks against real Beacon servers:

```sh
pnpm spike            # one fire from lighting to ash on 9q72.beacons.gg (about a minute)
pnpm spike:profile    # set a name from Watchfire and check the rest of the profile survives
node scripts/seed-fires.ts   # light a few fires around the world to play with

# Two local Beacon servers (members-only and Edinburgh-only) for multi-server work.
# BEACON_IMAGE is a Beacon 1.1 server image you can pull.
BEACON_IMAGE=<image> pnpm servers:up
pnpm spike:servers    # choosing a server, watch mode, asking to join and being let in
node scripts/local-operator.ts pending | approve <did>   # play the operator
pnpm servers:down
BEACON=http://localhost:3001 pnpm spike   # any script against a local server
```

### Layout

```
packages/core     @watchfire/core: the rules, the fire policy, reading the world, Beacon moves
apps/cli          the game (Ink), run locally or inside the door
apps/door         the SSH door, its store (files or Postgres) and the website's server
apps/dashboard    the website (Vite + React)
scripts/          spikes, seed fires, local test servers, the city list builder
docs/
```

## Credits

City names from [GeoNames](https://www.geonames.org) (CC BY 4.0). Map data from [Natural Earth](https://www.naturalearthdata.com) (public domain).

## License

[Apache License 2.0](LICENSE).
