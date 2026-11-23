# Contributing to Watchfire

Thanks for helping keep the fires burning. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

Open an issue with the bug form. It asks for your version (`watchfire --version`), how you play (a download, a door, or from a checkout), your system and terminal, and what happened. A screenshot of the terminal helps a lot.

Never put your keeper's twelve words, or the files in your Watchfire folder, in an issue. A security problem goes to a private report instead: see [SECURITY.md](SECURITY.md).

## Working on it

Set up and run it as the README's [Develop](README.md#develop) section says: Node 24 through nvm, and pnpm. Before a pull request:

```sh
pnpm typecheck
pnpm test
```

CI runs the same, and builds the game, on every pull request.

- **Play with test fires.** `WATCHFIRE_FIRE_TYPE=watchfire-dev pnpm play` keeps your fires out of everyone else's game. Plain `pnpm play` is real play on `9q72.beacons.gg`, which everyone sees.
- **Rules belong to the fire.** A rule that matters between players goes in the fire's room policy (`packages/core/src/policy.ts`), where the server enforces it, not only in the client. [docs/beacon-integration.md](docs/beacon-integration.md) explains the split.
- **Both ways in.** The same screens run on a player's own computer and inside a door (`apps/door`). A change to one usually needs a look at the other: [docs/architecture.md](docs/architecture.md) shows the seam.
- **80 × 24.** Every screen has to work at 80 columns by 24 rows, and grow with a bigger window.
- **Docs move with the code.** If a change alters what players see or how a door is run, update the doc that says so (`docs/how-to-play.md`, `docs/ssh-door.md`, `docs/deploy.md`).

## Licence

Watchfire is under the [Apache License 2.0](LICENSE). By sending a pull request, you agree that your contribution is licensed under it too.
