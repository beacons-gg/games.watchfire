# Architecture

## Shape

```
watchfire/
  packages/core       @watchfire/core: tuning, fire policy, items, readFire, connect()
  apps/cli            the game's UI (Ink), run locally or inside the SSH door
  apps/door           the SSH server that hosts apps/cli per session, and the website's server
  apps/dashboard      the website: the game explained, world map, dying fires, the watch log
  scripts/            spikes, seed fires, local test servers, the city list builder
  docs/
```

- **Node 24** through nvm (`.nvmrc`), pnpm workspaces, no build step in development: core, tests and scripts run under Node's type stripping, and the CLI's TSX runs under `tsx`. `pnpm typecheck` runs `tsc`; `pnpm test` runs `node --test`.
- **No game backend.** Every piece talks to Beacon servers directly. The SSH door is a host for terminal sessions, not a game server: it holds door players' keys and runs the same client code. It also serves the website, from its own reads of the world.

```
 local CLI ─────────┐
                     ├──► @watchfire/core ──► Beacon servers (9q72.beacons.gg, …)
 ssh ─► door ─► CLI ┘                              ▲
 browser ─► door's website (/api/world, reads only) ┘
```

## `@watchfire/core`

Shared by everything:

- `tuning.ts`: `GAME_SLUG`, `FIRE_TYPE`, `DEFAULT_SERVERS`, `LOGS_PER_DAY`, `FIRE_TUNING`, `SPIKE_TUNING`.
- `policy.ts`: `firePolicy(tuning, type)`.
- `items.ts`: `mintItem`, `mintLog`, `mintEmbers`.
- `fire.ts`: `readFire(room)` → `FireView`, judged by the clock (`ageFire`); `hostOf(roomId)`; `mergeLook` (a server that didn't answer keeps its last-known fires); `sortFires`; and `moveBlocker(move, fire, ctx)`, the one set of move rules that both greys out keys and explains a refused key press.
- `turns.ts`: `logsLeft` / `spendLog`, the client-enforced logs-a-day rule.
- `time.ts`: `formatDuration`, `clock`, `ago`, `stamp`, `shortDate`, `nowSec`.
- `beacon.ts`: `connect({ servers, wallet })` returns the game's moves (`light`, `feed`, `collectEmber`, `warmHands`, `rakeAshes`, `fire`, `fires`, `displayName`, `setDisplayName`, `requestToJoin`) and the multi-server lookups (`serverOf`, `lightTargets`, `coverageAt`, `writableOrigin`, `readOnlyReason`, `watchFire`, `reorder`, `setMode`, `recheck`). `light` owns placement: the default server, the spread within a city, and refusing a chosen server that can't take the fire on top of the SDK client. It verifies each server's descriptor and reports a status per server (`ok`, `notHosting`, `keyChanged`, `unreachable`), plus membership and latency. Fires are read from every `ok` server; moves go only to servers the player can play on (`canPlayOn`: play mode, and a member where that applies), and anything else throws `ReadOnlyError` with the reason; new fires go to the play server that covers the place best (`selectCoveringServer`). Ops retry with the same nonce (`sendOpWithRetry`).
- `servers.ts`: `SavedServer` (origin, mode, pinned key), `directoryServers()` for the beacons.gg directory, `coverageLabel`, `accessLabel`, `serverLabel`, `canPlayOn`, `canAskToJoin`, `isDown`, `needsRecheck`, `needsLook`, `downHosts`, `membershipChanges`, and the pure list edits behind the Servers screen: `pinStatuses` (trust on first use), `withServer`, `withoutServer`, `withMode`, `moveServer`.
- `profiles.ts`: `publishDisplayName`, which sets a name and keeps the rest of the player's profile.
- `flame.ts` (`@watchfire/core/flame`): the fire animation's simulation (`FlameSim`, `FLAME_PALETTE`, `strengthFor`), with no imports, drawn by the CLI in half-blocks and by the website on a canvas.
- `report.ts` (`@watchfire/core/report`): `WorldReport`, what the door's `/api/world` gives the website.
- `look.ts`: reading the world the same way in the game and the door's website: `foldLook` (a look merged into what was known, with the news), `NameBook` (display names, looked up a few at a time and kept a while), `PlaceBook` (each fire's nearest city).

Also: `newsBetween`/`snapshotOf` (the news), `safeText`/`stripControls` (player text), `MOVE_TEXT` and `refusalText` (every refusal in one place), `keeperName` (a stable two-word name from a DID, e.g. "Quiet Heron"), `searchCities`/`nearestCity`, and `distanceKm`/`jitter`/`formatDistance` (kilometres or miles).

## CLI (`apps/cli`)

- **Ink 8** (React for the terminal), React 19. Development runs the TSX directly with `tsx` (`pnpm play`). Node's own type stripping doesn't handle JSX.
- **Layout** fills the terminal (`useSize`): never below 80×24, and wider or taller windows grow the flame, the name columns and the lists. It follows resizes.
- `src/app.tsx` routes between screens (main, fire, world, light, news, you, servers, help, watch place); `src/game.ts` (`useGame`) holds the connection, the world, the keeper's state, the news and every move; `src/screens/*` are the screens; `src/ui.tsx` holds the frame, burn bars, text input and flame view.
- **The flame** (`src/flame.ts`) is the doom-fire spread on half-block pixels, one precomputed ANSI string per row. Truecolor when `COLORTERM` says so, else xterm-256. Its strength follows the fire, so a dying fire burns low and ash draws nothing.
- **The `Session` seam** (`src/session.ts`): wallet (or `null` for a guest), keeper store, servers, node number, color depth, the keeper's "today", and the guest hint. The local CLI builds one in `main.tsx`; the door builds one per SSH session and adds its extras under one optional `door` object (who's online, the screen a player is on, the motd, the recovery phrase), so the shared screens check one thing and the door's wording stays in `apps/door`.
- **Local state** in `~/.config/watchfire/` (`WATCHFIRE_HOME` overrides), owner-only: `keeper-key.json` (the SDK's wallet entry, with the recovery phrase) and `state.json` (watch place, logs today, embers, raked, last snapshot, units, and the server list with modes and pinned keys).
- **Commands:** `watchfire`, `watchfire phrase`, `watchfire import`, `--server <url>` (fixes the list for one session, unsaved), `--watch-only`, `--help`, `--version`.
- **Dev switches:** `WATCHFIRE_FIRE_TYPE=watchfire-dev` plays with a separate room type so test fires never mix with real ones; `WATCHFIRE_SERVERS` overrides the server list.
- **Dependencies** are all `devDependencies` in `apps/cli/package.json`, on purpose: the bundle inlines them, so a published package asks npm for nothing, least of all the unpublished `@watchfire/core`.
- **Distribution:** `pnpm build` bundles everything with esbuild into `apps/cli/dist/watchfire.mjs` (about 10 MB, most of it the town list; the SDK and Ink inlined too; `react-devtools-core` stubbed). It runs on Node 22+ with no `node_modules`, so publishing it to npm gives a one-line `npx` install. **The name `watchfire` is taken on npm** (an unrelated library), so it needs a scoped name such as `npx @<scope>/watchfire`; the command it installs can still be `watchfire`. Not published yet.
- **Executables:** a release tag runs [`.github/workflows/release.yml`](../.github/workflows/release.yml), which compiles that bundle with Bun (`scripts/package-cli.sh`) into standalone executables for Windows, macOS and Linux, each with its own runtime (40–55 MB compressed), `LICENSE` and `THIRD-PARTY-NOTICES.txt` (written by the CLI's build from what esbuild bundled). They ignore any `.env` or `bunfig.toml` where they're run. The Windows one is compiled on a Windows runner, the only place Bun will set its icon (`apps/cli/assets/watchfire.ico`, made from the listing's icon by `listing/tools/ico.mjs`) and its version details. The macOS ones carry Bun's ad-hoc signature, not a Developer ID.
- **Cities** come from GeoNames `cities1000` (CC BY 4.0): every place of 1,000 people or more, about 150,000, built into `packages/core/data/cities.json` (9 MB) by `scripts/build-cities.ts`. Fire places are labelled with the nearest listed place, or a city of 100,000 or more, ten times its size, at most 1.5 km farther ("Shibuya", not a street in it), worked out offline with no geocode requests. The list is stored south to north, so a lookup reads only a band of latitude (under a millisecond near a town), and labelling makes way for other players after any slow one. The door builds the town search when it starts (about 0.15 s), so the first player to search doesn't wait.

## SSH door (`apps/door`)

An `ssh2` server that renders the CLI's Ink app (`watchfire/app`, exported by `apps/cli` for the workspace) into each SSH channel, with a `Session` per player: a custodial keeper (or a guest), a shared paced `fetch`, a UTC day, and its `door` extras (`online`, `onScreen`, `motd`, `revealPhrase`). What it keeps (host key, keepers, motd, bans, the website's watch log) goes through one `DoorStore` (`store.ts`): files in its home folder, or Postgres. The website (`site.ts`) runs inside the door or, with `WATCHFIRE_DOOR_PORT=0`, alone. See [ssh-door.md](ssh-door.md).

## Dashboard (`apps/dashboard`)

The website, and the game's flyer: a Vite + React page served by the door (see [ssh-door.md](ssh-door.md#the-website)).

- **Reads `/api/world` from the door**, not Beacon. The door already reads the world (shared across its sessions) and, with the same core code as the game (`look.ts`), labels fires with their nearest city, looks up names, and writes the watch log; the page gets all that in one small JSON (`WorldReport`, `@watchfire/core/report`). So the browser needs no Beacon SDK, no city list, and no CORS entry on any Beacon server.
- **Shows:** the hero (the game's own flame, from `@watchfire/core/flame`, on a canvas, burning higher the more fires burn), the join command, today's numbers, a map of the fires (`d3-geo`, Natural Earth 1:50m, framed on the fires or the whole world), the fires closest to going out, a fire's details, the watch log, how to play (its numbers straight from core's `tuning.ts`), and how to join on a Mac, Windows or a phone.
- Countdowns tick every second between reads, on the server's clock.
- A static site that reads Beacon directly (for a beacons.gg home page) remains possible later: it would need the origin in each server's `BEACON_CORS_ORIGINS`.
