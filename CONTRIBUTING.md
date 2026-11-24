# Contributing to Watchfire

Thanks for helping keep the fires burning. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

Open an issue with the bug form. It asks for your version (`watchfire --version`), how you play (a download, a door, or from a checkout), your system and terminal, and what happened. A screenshot of the terminal helps a lot.

Never put your keeper's twelve words, or the files in your Watchfire folder, in an issue. A security problem goes to a private report instead: see [SECURITY.md](SECURITY.md).

## Setting up

You'll need Node 24 (through nvm) and pnpm. Everything installs from npm, including Beacon's SDK (`@beaconsgg/*`).

```sh
nvm use
pnpm install
pnpm typecheck
pnpm test             # WATCHFIRE_TEST_DATABASE_URL=postgres://… also runs the Postgres tests
pnpm play             # the game, on the shared world at 9q72.beacons.gg
WATCHFIRE_FIRE_TYPE=watchfire-dev pnpm play   # the game with test fires, invisible to normal play
pnpm door             # the SSH door on :2222 (ssh -p 2222 localhost) and its website on :8080
pnpm dashboard        # the website with live reload on :5173, reading a running door's /api/world
pnpm build            # apps/cli/dist/watchfire.mjs (one self-contained file) and the website
```

**Play with test fires.** Plain `pnpm play` is real play, which everyone sees. `WATCHFIRE_FIRE_TYPE` keeps your fires out of everyone else's game, and theirs out of yours. Don't hand that setting to playtesters, or their fires won't show up for anyone else. `WATCHFIRE_FIRE_TYPE=watchfire-dev node scripts/seed-fires.ts` lights a few test fires around the world to play with.

## Before a pull request

```sh
pnpm typecheck
pnpm test
```

CI runs the same, and builds the game, on every pull request.

- **Rules belong to the fire.** A rule that matters between players goes in the fire's room policy (`packages/core/src/policy.ts`), where the server enforces it, not only in the client. [docs/beacon-integration.md](docs/beacon-integration.md) explains the split.
- **Both ways in.** The same screens run on a player's own computer and inside a door (`apps/door`). A change to one usually needs a look at the other: [docs/architecture.md](docs/architecture.md) shows the seam.
- **80 × 24.** Every screen has to work at 80 columns by 24 rows, and grow with a bigger window.
- **Docs move with the code.** If a change alters what players see or how a door is run, update the doc that says so (`docs/how-to-play.md`, `docs/run-a-door.md`).

## Checking against real Beacon servers

The tests run offline. These scripts check the game's Beacon side against real servers:

```sh
pnpm spike            # one fire from lighting to ash on 9q72.beacons.gg (about a minute)
pnpm spike:profile    # set a name from Watchfire and check the rest of the profile survives
```

For work on several servers, start two local Beacon servers, one members-only and one covering only Edinburgh:

```sh
BEACON_IMAGE=<image> pnpm servers:up     # a Beacon 1.1 server image you can pull
pnpm spike:servers    # choosing a server, watch mode, asking to join and being let in
node scripts/local-operator.ts pending | approve <did>   # play the operator
pnpm servers:down

BEACON=http://localhost:3001 pnpm spike  # any script against a local server
```

## Releasing

Set `version` in `apps/cli/package.json`, commit, then tag and push:

```sh
git tag v0.2.0 && git push origin v0.2.0
```

The [release workflow](.github/workflows/release.yml) checks that the tag matches, runs the tests, builds executables for Windows, macOS (Apple silicon and Intel) and Linux (x64 and ARM) with Bun, runs each on its own OS, and publishes them as a GitHub release. A tag with a suffix (`v0.2.0-rc.1`) makes a pre-release.

- Each OS builds its own. Only on Windows does Bun give the executable the game's icon and details, and only on macOS can `codesign` sign the Mac ones so they run.
- The Mac builds are ad-hoc signed, not with an Apple Developer ID, so players unblock them once (the release notes say how).
- `gh workflow run release.yml --ref <branch>` is a dry run: everything is built and checked, nothing published.
- To build the archives locally: `pnpm -C apps/cli run build && scripts/package-cli.sh 0.2.0`. Off Windows, the Windows executable has no icon or details; off macOS, the Mac ones keep Bun's signature.

## Licence

Watchfire is under the [Apache License 2.0](LICENSE). By sending a pull request, you agree that your contribution is licensed under it too.
