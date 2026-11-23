# Roadmap

## Built

- **The spike** (2026-11-18). `pnpm spike` plays one fire from lighting to ash on `9q72.beacons.gg` and checks 18 rules the server must enforce. All pass.
- **The game** (2026-11-18). `apps/cli` on Ink: the main screen, fires, the world, lighting, the news, You, help and the watch place, all keyboard-driven and filling any terminal from 80×24 up. An animated fire whose strength follows the fire's. A file-backed keeper (`watchfire phrase`, `watchfire import`). Three logs a day; light, feed, take an ember, warm hands, rake ashes, each refusal in plain words. Beacon profile names, set from the game. Kilometres or miles. `pnpm build` bundles it into one file that runs with no `node_modules`.
- **Several servers** (2026-11-19). Every fire shows its server; choose where to light; members-only servers with asking to join; priority, latency and trust on first use; a server that stops answering keeps its fires on the map as last seen. `pnpm spike:servers` checks it against two local servers (22 checks).
- **The SSH door** (2026-11-19). `apps/door` runs the game per SSH session: custodial keepers per SSH key (recovery phrases sealed under a master key), watch-only guests, one shared and paced write budget per server, shared reads, who's online, pages, the motd, bans, and session limits. Data in files or Postgres; sysop commands. One Docker image and a compose file (see [deploy.md](deploy.md)).
- **Warm hands from any Beacon game** (2026-11-20). The fire policy opens `react`, and only `react`, to every game; checked by `pnpm spike` on a server that admits other games.
- **Executables** (2026-11-20). A version tag builds the game for Windows, macOS and Linux and publishes a GitHub release ([release.yml](../.github/workflows/release.yml)). The Windows one has the game's icon and details (2026-11-22).
- **Listed in the beacons.gg directory** (2026-11-21), waiting for review: [listing/](../listing).
- **Local play first** (2026-11-23). Most players run a download, so: the website leads with it (a button for the visitor's computer, steps for Windows, a Mac and Linux, the door as the other way in); the game reminds a local keeper to write down its twelve words until they have (You → K); and it says on the main screen when a newer release is out. Each release is built on Linux, Windows and macOS (the Mac ones signed there; the Intel build's signature from Linux was invalid) and run on each before it's published.
- **The website** (2026-11-19). `apps/dashboard`, served by the door: the game explained, how to start playing, today's numbers, a map of the fires, the ones closest to going out, and the watch log. It can also run alone, with no door on its machine.

## Next

- [ ] Open the source, so the downloads (and the update check) reach players: see [open-source.md](open-source.md).
- [ ] Sign and notarize the macOS executables with an Apple Developer ID (an Apple Developer account), and sign the Windows one, so players don't have to unblock them. It's the first thing every new player hits.
- [ ] A home for the website at a domain, running alone (see [deploy.md](deploy.md#website-only)); then the repo's homepage and the listing link to it.
- [ ] A playtest with a small group, to check the tuning.
- [ ] Release files without the version in their names as well, so a page can link straight to the latest download for each computer.
- [ ] Install from a package manager: a Homebrew tap, winget, Scoop.
- [ ] A public door, for players on phones or who'd rather not download: host, domain and DNS.
- [ ] Publish the CLI to npm for a one-line `npx` install. `watchfire` is taken on npm, so it needs a scope.
- [ ] The door's master key in a KMS rather than a file or environment variable.
- [ ] News while idle from live updates rather than the 30-second refresh.
- [ ] Admit other games on `9q72`, so their players can warm their hands at fires there (fires already allow it).

## Later

- [ ] Sparks: a spark flies from a burning fire (a Beacon scout) and lights a new one where it lands (see [game-design.md](game-design.md#sparks-later)). Verify the three-phase policy on a test server first.
- [ ] Mail one-liners ("thanks for keeping my fire alive").
- [ ] A static website that reads Beacon directly, for a beacons.gg home page (needs its origin in each server's `BEACON_CORS_ORIGINS`).
- [ ] An indexer, if fires outgrow a few hundred.

## Open questions

- **Tuning.** The numbers are set for a small group (12 hours on its own, +4 hours a log, 12 logs, an ember at 5; see [game-design.md](game-design.md#tuned-for-a-small-group)). A playtest will tell.
- **Servers.** Stay on `9q72` alone, or add regional servers? Each has to admit the game (`watchfire-door`).
- **npm scope** for the published CLI.
