# Watchfire docs

Watchfire is a BBS-style door game played in a terminal: locally with `npx`, or with nothing to install over `ssh`. Fires burn at real places on the map. Players keep them alive with logs, collect embers from the fires they tend, and watch fires go dark. The game runs on [Beacon](https://beacons.gg), so the fires live on Beacon servers and the room policies are the rules. Watchfire has no game backend of its own. A read-only web dashboard shows the whole world's fires live.

| Doc | What it covers |
| --- | --- |
| [vision.md](vision.md) | What we're making, for whom, and why it's a terminal game and not a website game |
| [game-design.md](game-design.md) | Rules, the core loop, screens, the daily news, embers, sparks, starting tuning |
| [beacon-integration.md](beacon-integration.md) | How the game maps onto Beacon: slug, server, the fire policy, items, what the server enforces and what it doesn't, and the gotchas we hit |
| [architecture.md](architecture.md) | The monorepo, the shared core, the CLI, the dashboard, identity storage and distribution |
| [ssh-door.md](ssh-door.md) | The `ssh` door: sessions, identity, rate limits, security, and the "who's online" extras only a door can do |
| [roadmap.md](roadmap.md) | Phases, what's done, and open questions |

## Status

- **Phase 1 (spike): done.** `pnpm spike` plays one fire from lighting to ash on `9q72.beacons.gg` through `@watchfire/core` and checks 18 rules the server must enforce. All pass.
- **Phase 2 (playable CLI): first cut done.** `pnpm play` runs the game; `pnpm build` makes the bundled `npx`-able file.
- **Next:** the SSH door (phase 3). See [roadmap.md](roadmap.md).
