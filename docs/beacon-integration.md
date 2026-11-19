# Beacon integration

Everything here was checked against Beacon 1.1 on `9q72.beacons.gg` by `pnpm spike` (`scripts/spike-fire.ts`), unless marked *unverified*.

## Server and slug

| | |
| --- | --- |
| Server | `https://9q72.beacons.gg` ("Watchfire main"), Beacon 1.1.0 |
| Coverage | the whole world (`[""]`) |
| Access | `open`: anyone may write |
| Services | `mailbox`, `geocode`. No `places`, no `media` |
| Game slug | **`watchfire-door`**, the only game this server admits. Constant: `GAME_SLUG` |
| Room types | `watchfire` for real fires, `watchfire-spike` for spikes and tests |
| CORS | not open to other origins yet. The dashboard needs its origin added to `BEACON_CORS_ORIGINS` |

A local server also works: `BEACON=http://localhost:3001 pnpm spike` against the compose file from Beacon's [Quickstart](https://beacons.gg/docs/quickstart.md).

## Packages

`@beaconsgg/*` 1.1.0 isn't on public npm. It installs from `registry.example.com` through the project `.npmrc` (`@beaconsgg:registry=…`). Your token for that host lives in `~/.npmrc`. Anything we publish for players (the CLI) must **bundle** the SDK, or installs fail for everyone without registry access.

## The fire policy

Built by `firePolicy()` in `packages/core/src/policy.ts`:

```ts
{
  type: "watchfire",
  ops: {
    list:       { role: "public" },
    contribute: { role: "public",      phase: "burning" },  // feed
    collect:    { role: "contributor", phase: "burning" },  // ember
    claim:      { role: "contributor", phase: "ash" },      // rake the ashes
    react:      { role: "public" },                         // warm hands
  },
  lifecycle: { phases: ["burning", "ash"], transitions: { ash: "outAt" } },
  derived: {
    logs:  { count: [{ var: "contents" }, "log"] },
    outAt: { "+": [{ var: "placedAt" }, baseSec, { "*": [{ var: "logs" }, secPerLog] }] },
  },
  accept: { class: ["log"], minLevels: { log: 1 }, capacity },
  maxContributors: capacity,
  grant: { op: "collect", from: "embers", count: 1, when: { ">=": [{ var: "logs" }, emberAt] } },
  onEmpty: "close",
  claimTtl: "1d",
}
```

Placed with `initialPools: { embers: [...capacity embers minted by the lighter] }`, then the lighter contributes the kindling log (`birth.kindling: true`).

## What the server enforces and what it doesn't

| Rule | Who | Verified by the spike |
| --- | --- | --- |
| Only `log` items go on a fire | server (`accept.class`) | a stone is refused `denied` |
| A forged log counts once | server (`count`, not `sum`) | `levels.log: 1000000` → logs +1 |
| Each log moves out time by `secPerLog` | server (`derived.outAt`) | yes |
| No logs after the fire is out | server (lifecycle) | refused `phase` |
| Fire life capped | server (`capacity`) | yes |
| Ember only for keepers, past the threshold, once each | server (role, `when`, one draw per pool) | stranger `denied`; second collect grants nothing |
| No embers from ash | server (`phase`) | refused `phase` |
| Rake once, only in ash | server | second rake `gone` |
| Warm hands once per player per target | server (reaction ledger) | the repeat answers `ok` but adds nothing |
| 3 logs a day | **client only** | n/a |
| Which city you "keep watch" from | **client only** | n/a |
| Spark flight speed | **client only** (scout config is never read by the server) | *unverified* |

Anything only the client enforces is cheatable by a modified client. The design keeps those to rules whose abuse is bounded by a server-side cap.

## Gotchas we hit

- **`count` needs a key.** `{ count: [{ var: "contents" }] }` isn't valid. `count` takes a level key and counts only the items with an integer at that key: `{ count: [{ var: "contents" }, "log"] }`. Every log therefore carries `match.levels.log = 1`.
- **A reaction's `target` must be an item in the room or an account DID.** The room id and arbitrary strings answer `gone`. Warm hands targets the fire's kindling log.
- **`summary.phase` in discovery lags.** It's the stored phase, updated only by the next op. Judge burning versus ash by the clock against `state.outAt` (`readFire` does).
- **Discovery summaries carry no name or out time.** They hold only `count`, `capacity` and `phase`, so listing fires costs one `resolveRoom` per fire. That's fine at hundreds of fires (600 reads a minute per address) and calls for an indexer beyond that.
- **Discovery accepts precision-1 cells.** The 32 cells `0…z` cover the world in one read (`WORLD_CELLS`). The live map channel needs precision-5 cells, at most 256 per socket, so a world view follows individual rooms (`subscribeRoom`, 256 per socket) instead.
- **Live deltas start after the subscription connects.** The spike missed the first ops. Always take a baseline with `resolveRoom` after subscribing and fold deltas on top, as Beacon's live-updates guide says.
- **Item `match` is unsigned.** Only `birth` is signed. Never trust another player's `match` for anything the server doesn't already enforce.

## Untrusted text

Fire names, and later mail, are written by other players and shown in terminals. **Strip control characters and ANSI escape sequences from all player text before rendering it.** Otherwise a fire named `\x1b]52;…` could write to a player's clipboard or rewrite their screen. This applies to the CLI, the SSH door and the dashboard (HTML-escape there).

## Identity

- The local CLI uses `loadOrCreateWallet` with a file-backed store, `~/.config/watchfire/keeper-key.json` (mode 0600, like an SSH private key), so there's no passphrase prompt. The SDK warns that this entry holds the recovery phrase in plain text; we accept that for a game key, the same way `~/.ssh` does. `watchfire phrase` reveals the phrase and `watchfire import` restores one. An OS-keychain store is a later option.
- Players appear under a stable two-word name made from their account DID ("Quiet Heron"), so the game never has to read profiles. Publishing real profiles with display names can come later.
- The SSH door holds wallets for its players. See [ssh-door.md](ssh-door.md#identity).
- A player's account is the same `did:key` on every Beacon server, so the phrase moves a player between the local CLI and the door.

## Servers the player trusts

- The list lives in the keeper's state: origin, mode (`play` or `watch`), and the descriptor key first seen there (trust on first use). New keepers start with `DEFAULT_SERVERS` (`9q72`).
- On every connect, each server's signed descriptor is checked. A server signing with a **different key** than the pinned one is marked `keyChanged` and gets nothing: no reads, no writes. Removing and re-adding it is how the player accepts the new key, as the SDK's registry does.
- A server that doesn't admit `watchfire-door` stays in the list as `notHosting`. It's still asked for profiles, which is how a name set in another game (say, on a Vestige server) shows up here.
- **Browse** reads `https://beacons.gg/api/v1/servers?game=watchfire-door`. The directory is only a place to find servers; adding one still verifies its descriptor.
- `--server <url>` fixes the list for one session without saving it.

## Names and profiles

- A player shows under their **Beacon profile display name** when one verifies on any listed server (`fetchBestProfile`), otherwise under the keeper name from their DID. Names are cached for 10 minutes and looked up only for players on screen: fire lighters, a fire's keepers, the player.
- **Setting a name** (You → N) publishes a new profile version to every play server. It keeps everything else: the other devices (another game's phone), revocations, handles, avatar, services, and unknown fields via `supersedes`. It adds this device if missing. `pnpm spike:profile` checks this against `9q72`: 9 checks, all passing.
- **One refusal:** `buildProfile` drops `keyAgreement`, an encryption key another game may manage. If the player's profile has one, Watchfire won't rename them and asks them to change their name in that game instead, so we never strip another game's key.
- **Using an existing Beacon account:** a player can only act as an account whose keys they hold, so "play as my DID" means importing that account's recovery phrase with `watchfire import`. Their profile name then shows up automatically.

## Limits that shape the design

From Beacon's [limits](https://beacons.gg/docs/limits.md) defaults:

| Limit | Default | Matters for |
| --- | --- | --- |
| Signed writes per **address** | 120/min | the SSH door: all door players share one IP |
| Room ops per account | 120/min | fine |
| Reactions per account | 60/min | fine |
| Discovery and room reads per address | 600/min | the dashboard and world view |
| Rooms per socket | 256 | live world view |
| Room or scout name | 64 characters | fire names |
| Mail body | 256 bytes | one-liners |

## Test leftovers on 9q72

The spikes leave `watchfire-spike` rooms on the server. Fires close a day after going out (`claimTtl`). One probe room from the first session (`01M7RXC7XH9A0E4HYDG1GJ2CQG`) has no lifecycle and stays until an operator removes it from the console.
