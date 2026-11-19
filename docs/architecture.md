# Architecture

## Shape

```
watchfire/
  packages/core       @watchfire/core: tuning, fire policy, items, readFire, connect()   [built]
  apps/cli            the door game UI (Ink), run locally or inside the SSH door        [built]
  apps/door           the SSH server that hosts apps/cli per session                    [phase 3]
  apps/dashboard      static read-only site: world map, dying fires, news               [phase 4]
  scripts/            spikes and tools
  docs/
```

- **Node 24** through nvm (`.nvmrc`), pnpm workspaces, no build step in development: core, tests and scripts run under Node's type stripping, and the CLI's TSX runs under `tsx`. `pnpm typecheck` runs `tsc`; `pnpm test` runs `node --test`.
- **No game backend.** Every piece talks to Beacon servers directly. The SSH door is a host for terminal sessions, not a game server: it holds door players' keys and runs the same client code.

```
 local CLI ─────────┐
                     ├──► @watchfire/core ──► Beacon servers (9q72.beacons.gg, …)
 ssh ─► door ─► CLI ┘                              ▲
 browser ─► dashboard (reads only) ─────────────────┘
```

## `@watchfire/core`

Shared by everything:

- `tuning.ts`: `GAME_SLUG`, `FIRE_TYPE`, `DEFAULT_SERVERS`, `LOGS_PER_DAY`, `FIRE_TUNING`, `SPIKE_TUNING`.
- `policy.ts`: `firePolicy(tuning, type)`.
- `items.ts`: `mintItem`, `mintLog`, `mintEmbers`.
- `fire.ts`: `readFire(room)` → `FireView`, judged by the clock (`ageFire`); `hostOf(roomId)`; `mergeLook` (a server that didn't answer keeps its last-known fires); `sortFires`; and `moveBlocker(move, fire, ctx)`, the one set of move rules that both greys out keys and explains a refused key press.
- `turns.ts`: `logsLeft` / `spendLog`, the client-enforced logs-a-day rule.
- `time.ts`: `formatDuration`, `clock`, `ago`, `stamp`, `shortDate`, `nowSec`.
- `beacon.ts`: `connect({ servers })` returns the game's moves (`light`, `feed`, `collectEmber`, `warmHands`, `rakeAshes`, `fire`, `fires`, `displayName`, `setDisplayName`) on top of the SDK client. It verifies each server's descriptor and reports a status per server (`ok`, `notHosting`, `keyChanged`, `unreachable`). Fires are read from every `ok` server; moves go only to servers in **play** mode (a fire on a **watch** server throws `WatchOnlyError`); new fires go to the play server that covers the place best (`selectCoveringServer`). Ops retry with the same nonce (`sendOpWithRetry`).
- `servers.ts`: `SavedServer` (origin, mode, pinned key), `directoryServers()` for the beacons.gg directory, `coverageLabel`, and the pure list edits behind the Servers screen: `pinStatuses` (trust on first use), `withServer`, `withoutServer`, `withMode`.
- `profiles.ts`: `publishDisplayName`, which sets a name and keeps the rest of the player's profile.

Also: `newsBetween`/`snapshotOf` (the news), `safeText`/`stripControls` (player text), `MOVE_TEXT` and `refusalText` (every refusal in one place), `keeperName` (a stable two-word name from a DID, e.g. "Quiet Heron", so no profile reads), `searchCities`/`nearestCity`, `distanceKm`/`jitter`/`formatDuration`, and `refusalText` (refusal codes in plain words).

## CLI (`apps/cli`)

- **Ink 8** (React for the terminal), React 19. Development runs the TSX directly with `tsx` (`pnpm play`). Node's own type stripping doesn't handle JSX.
- **Layout** fills the terminal (`useSize`): never below 80×24, and wider or taller windows grow the flame, the name columns and the lists. It follows resizes.
- `src/app.tsx` routes between screens (main, fire, world, light, news, you, servers, help, watch place); `src/game.ts` (`useGame`) holds the connection, the world, the keeper's state, the news and every move; `src/screens/*` are the screens; `src/ui.tsx` holds the frame, burn bars, text input and flame view.
- **The flame** (`src/flame.ts`) is the doom-fire spread on half-block pixels, one precomputed ANSI string per row. Truecolor when `COLORTERM` says so, else xterm-256. Its strength follows the fire, so a dying fire burns low and ash draws nothing.
- **The `Session` seam** (`src/session.ts`): wallet (or `null` for a guest), keeper store, servers, node number, color depth, the keeper's "today", and the guest hint. The local CLI builds one in `main.tsx`; the door will build one per SSH session.
- **Local state** in `~/.config/watchfire/` (`WATCHFIRE_HOME` overrides), owner-only: `keeper-key.json` (the SDK's wallet entry, with the recovery phrase) and `state.json` (watch place, logs today, embers, raked, last snapshot, and the server list with modes and pinned keys).
- **Commands:** `watchfire`, `watchfire phrase`, `watchfire import`, `--server <url>` (fixes the list for one session, unsaved), `--watch-only`, `--help`, `--version`.
- **Dev switches:** `WATCHFIRE_FIRE_TYPE=watchfire-dev` plays with a separate room type so test fires never mix with real ones; `WATCHFIRE_SERVERS` overrides the server list.
- **Dependencies** are all `devDependencies` in `apps/cli/package.json`, on purpose: the bundle inlines them, so a published package must not ask npm for the private `@beaconsgg/*` or the unpublished `@watchfire/core`.
- **Distribution:** `pnpm build` bundles everything with esbuild into `apps/cli/dist/watchfire.mjs` (3.2 MB: the SDK, Ink and the city list inlined; `react-devtools-core` stubbed). It runs on Node 22+ with no `node_modules`, so publishing it to npm gives a one-line `npx` install. **The name `watchfire` is taken on npm** (an unrelated library), so it needs a scoped name such as `npx @<scope>/watchfire`; the command it installs can still be `watchfire`. Not published yet.
- **Cities** come from GeoNames `cities15000` (CC BY 4.0), built into `packages/core/data/cities.json` by `scripts/build-cities.ts`. Fire places are labelled with the nearest listed city, offline, so no geocode requests.

## SSH door (`apps/door`)

See [ssh-door.md](ssh-door.md).

## Dashboard (`apps/dashboard`)

- A static Vite site. No wallet and no backend.
- World reads: one discovery read over `WORLD_CELLS` per trusted server, then `resolveRoom` per fire, refreshed on a timer. Live: `subscribeRoom` for up to 256 fires (dying fires first).
- Views: a world map of glowing fires (brighter = more logs, flicker = dying), a "dying fires" ticker, the news feed, and today's numbers.
- Needs the dashboard's origin in each server's `BEACON_CORS_ORIGINS`.
- An indexer service only if fires outgrow a few hundred.
