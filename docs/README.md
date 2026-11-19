# Watchfire docs

Watchfire is a BBS-style door game played in a terminal: locally with `npx`, or with nothing to install over `ssh`. Fires burn at real places on the map. Players keep them alive with logs, collect embers from the fires they tend, and watch fires go dark. The game runs on [Beacon](https://beacons.gg), so the fires live on Beacon servers and the room policies are the rules. Watchfire has no game backend of its own. A read-only web dashboard shows the whole world's fires live.

| Doc | What it covers |
| --- | --- |
| [how-to-play.md](how-to-play.md) | For players: coming in over ssh, the rules, the keys |
| [vision.md](vision.md) | What we're making, for whom, and why it's a terminal game and not a website game |
| [game-design.md](game-design.md) | Rules, the core loop, screens, the daily news, embers, sparks, starting tuning |
| [beacon-integration.md](beacon-integration.md) | How the game maps onto Beacon: slug, server, the fire policy, items, what the server enforces and what it doesn't, and the gotchas we hit |
| [architecture.md](architecture.md) | The monorepo, the shared core, the CLI, the dashboard, identity storage and distribution |
| [ssh-door.md](ssh-door.md) | The `ssh` door: sessions, identity, rate limits, security, and the extras only a door can do (who's online, pages, bans) |
| [deploy.md](deploy.md) | Running the door in Docker or Dokploy: secrets, settings, backups, sysop commands |
| [roadmap.md](roadmap.md) | Phases, what's done, and open questions |

## Status

- **Phase 1 (spike): done.** `pnpm spike` plays one fire from lighting to ash on `9q72.beacons.gg` through `@watchfire/core` and checks 18 rules the server must enforce. All pass.
- **Phase 2 (playable CLI): first cut done.** `pnpm play` runs the game; `pnpm build` makes the bundled `npx`-able file.
- **Several servers (phase 2.5): done.**
- **Phase 3 (SSH door): built, and runs in Docker.** `pnpm door`, then `ssh -p 2222 localhost`; or `docker compose up -d --build` (see deploy.md).
- **Phase 4 (the website): built.** The door serves it on :8080: the game explained, how to join, and the world live. Next: the family playtest on the home network.
