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
| CORS | not open to other origins. Not needed: the website reads the world through its door (`/api/world`) |

A local server also works: `BEACON=http://localhost:3001 pnpm spike` against the compose file from Beacon's [Quickstart](https://beacons.gg/docs/quickstart.md).

## Packages

`@beaconsgg/*` 1.1.0 isn't on public npm. It installs from Beacon's registry, `registry.example.com`, through the project `.npmrc` (`@beaconsgg:registry=…`), with a token for that host in `~/.npmrc`. So everything players run **bundles** the SDK: the CLI is one file, and so is the door in its image. Nobody needs the registry to play or to run a published image.

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

Fire names, and later mail, are written by other players and shown in terminals. **Strip control characters and ANSI escape sequences from all player text before rendering it.** Otherwise a fire named `\x1b]52;…` could write to a player's clipboard or rewrite their screen. This applies to the CLI, the SSH door and the website (HTML-escape there).

## Identity

- The local CLI uses `loadOrCreateWallet` with a file-backed store, `~/.config/watchfire/keeper-key.json` (mode 0600, like an SSH private key), so there's no passphrase prompt. The SDK warns that this entry holds the recovery phrase in plain text; we accept that for a game key, the same way `~/.ssh` does. `watchfire phrase` reveals the phrase and `watchfire import` restores one. An OS-keychain store is a later option.
- Players without a profile name appear under a stable two-word name made from their account DID ("Quiet Heron"). See [Names and profiles](#names-and-profiles).
- The SSH door holds wallets for its players. See [ssh-door.md](ssh-door.md#identity).
- A player's account is the same `did:key` on every Beacon server, so the phrase moves a player between the local CLI and the door.

## Servers the player trusts

- The list lives in the keeper's state: origin, mode (`play` or `watch`), and the descriptor key first seen there (trust on first use). New keepers start with `DEFAULT_SERVERS` (`9q72`).
- On every connect, each server's signed descriptor is checked. A server signing with a **different key** than the pinned one is marked `keyChanged` and gets nothing: no reads, no writes. Removing and re-adding it is how the player accepts the new key, as the SDK's registry does.
- A server that doesn't admit `watchfire-door` stays in the list as `notHosting`. It's still asked for profiles, which is how a name set in another game (say, on a Vestige server) shows up here.
- **Browse** reads `https://beacons.gg/api/v1/servers?game=watchfire-door`. The directory is only a place to find servers; adding one still verifies its descriptor.
- `--server <url>` fixes the list for one session without saving it.
- **Priority:** the list order is the player's priority (+/- on the Servers screen). When two servers cover a place equally well, the higher one gets new fires. Reordering and switching play/watch apply to the open connection at once (`reorder`, `setMode`), with no reconnect.
- **Latency** comes from `pingServer` on each connect and shows on the Servers screen and the light picker.

## Several servers at once

- **Every fire says where it lives.** The Fire screen shows "on <server> (<host>)" and, if the player can't act there, why. The World view has a Server column and **F** to filter to one server. With more than one readable server, the main screen's nearest-fires list shows each fire's server too.
- **Choosing where a fire is lit.** `lightTargets(place)` lists the servers that would take a fire at the place: verified, hosting Watchfire, in play mode, a member where membership applies, and covering the point (`serversCovering`). The default comes first: the most specific coverage (`selectCoveringServer`), ties to the higher server in the list. With one target the game skips the question. With none it explains why (outside every play server's area, watched, or not a member). A fire is nudged up to 800 m from the city center only if the nudge stays inside the chosen server's area.
- **A server needing a look** (not answering, a new key, a request waiting) shows on the main screen: "1 server needs a look (S)".
- **A server that stops answering** doesn't take its fires with it. They stay listed with estimated times ("~3h12m") and "last seen 5m ago"; the World view shows "not answering"; the Fire screen says so and moves are refused. `mergeLook` marks those fires `stale`, keeping when they were read (`readAt`). The keeper's state keeps the last-known fires (`known`), so this works after a restart too. Every refresh pings a down server (and asks a members-only server about a waiting request) and connects afresh only when something changed (`recheck`), so a server that stays down costs one ping per 30 seconds. A server that goes quiet mid-session shows as "not answering" on the Servers screen. A server whose **key changed** is different: it's untrusted, so its fires are hidden until the player re-adds it.
- **News** reports a fire "gone from the map" only when its own server answered without it.
- **Watch place:** if no server the player plays on covers it, the main screen says so, and so does picking the place. While a play server is down this stays quiet (`coverageAt` answers "unknown"), since the down server might cover it.

## Members-only servers (`request` and `private`)

Reads stay open at every access level, so their fires always show. Writes need membership.

- On connect, for each server whose descriptor says `access:members` and whose level isn't `open`, the game asks `fetchAccess`: `member`, `pending`, `declined` or `none`. Only members play there; the Servers screen shows "member", "asked to join", "declined", "members only" or "private".
- **Asking to join** (Servers → J, `request` servers only) first puts the player's profile on that server, because the operator sees it next to the request. That's the player's newest verified profile as signed, or a bare one (no name) if they have none, so nothing is rebuilt or stripped. Then `requestAccess` with an optional note (up to 280 characters). A `private` server takes no requests; the game says to ask its operator.
- While a request waits, each 30-second refresh reconnects, which re-checks membership. When the operator answers, the player sees "Members Hall let you in." or "…declined your request." (`membershipChanges` against the saved list).
- Moves on a fire whose server won't take them are stopped before sending, with the reason (`readOnlyReason`). If the server refuses anyway, `notMember` reads "That server only takes members. Ask to join under Servers (J)." The client declares `code:notMember`, `code:gameNotAccepted`, `code:deviceRevoked` and `code:clockSkew` so servers send those codes.
- `pnpm spike:servers` checks all of this against `9q72` plus two local servers (`pnpm servers:up`): a `request` one and an open one covering only Edinburgh. 22 checks, all passing, including ask → operator approves (`scripts/local-operator.ts`) → light and feed there.

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
| Discovery and room reads per address | 600/min | the door, which reads once for all its players and its website |
| Rooms per socket | 256 | live world view |
| Room or scout name | 64 characters | fire names |
| Mail body | 256 bytes | one-liners |
