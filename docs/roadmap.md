# Roadmap

## Phase 1: spike ✅ (2026-11-18)

- [x] pnpm workspace on Node 24, `@beaconsgg/*` 1.1.0 from `registry.example.com`
- [x] `@watchfire/core`: tuning, fire policy, items, `readFire`, `connect()`
- [x] `pnpm spike`: one fire from lighting to ash on `9q72.beacons.gg`, 18 checks, all passing
- [x] Found and fixed: `count` needs a key; reaction targets must be an item or DID; discovery's phase lags the clock

## Phase 2: playable CLI ✅ (2026-11-18, first cut)

- [x] `apps/cli` with Ink 8: main, fire, world, light, news, embers, help and watch-place screens; single-key shortcuts; 80×24
- [x] Animated fire (doom-fire spread, half-blocks), truecolor with a 256-color fallback; its strength follows the fire (ash draws nothing)
- [x] File-backed wallet and state in `~/.config/watchfire/` (0600); `watchfire phrase`, `watchfire import`
- [x] "Where do you keep watch?" over 34,201 GeoNames cities (CC BY 4.0, credited in Help and `--help`), or "lat, lng"
- [x] 3 logs a day; light / feed / take ember / warm hands / rake ashes, with every refusal in plain words
- [x] News: snapshot diff on each refresh ("since your last visit"), and live updates for the fire you're looking at
- [x] Player text sanitized everywhere it's shown
- [x] Guests are watch-only (`--watch-only` locally; the door's keyless players)
- [x] Bundled build: `pnpm build` → `apps/cli/dist/watchfire.mjs` (3.2 MB, SDK and cities inlined, runs with no `node_modules`)
- [x] Tested in a real terminal (tmux) against `9q72`: onboarding, lighting, feeding, the daily limit, warm hands, the ember gate, a second keeper taking an ember, guest mode
- [x] Fills the terminal: 80×24 at least, and bigger windows get a bigger flame, longer lists, more news; follows resizes
- [x] Servers screen: every server you read, play or watch per server, add by address, browse the beacons.gg directory, remove; keys pinned on first sight
- [x] Names: Beacon profile display names shown for players who have one (keeper names otherwise); set your own from the You screen, merged into your existing profile
- [x] Fixed: raking a live fire said "That fire has gone out"; text plus Enter in one chunk (fast typing, SSH, paste) didn't submit
- [ ] Not yet: live map updates for the news while idle (it polls every 30s), publishing to npm (needs a scoped name), raking tested in the UI (the spike covers it on the server)

## Phase 2.5: several servers ✅ (2026-11-19)

- [x] Each fire's server on the Fire screen, the World view (with a filter) and the main list
- [x] Choose the server when lighting; the most specific coverage is the default; nudges stay in the server's area
- [x] Members-only servers: membership per server, ask to join with a note, approvals noticed on refresh, moves stopped with the reason
- [x] Server priority (+/-), latency, and a "server needs a look" notice
- [x] Local test servers (`pnpm servers:up`), an operator script, and `pnpm spike:servers` (22 checks)
- [x] A server that stops answering: its fires stay, with "~" times and "last seen …" (also after a cold start, from the saved last-known fires); the game re-checks it every refresh and picks it back up
- [x] News reports a fire gone only when its own server answered without it (not when a server went quiet, was removed, or changed key)
- [x] Warning when no server you play on covers your watch place

## Phase 3: SSH door ✅ (2026-11-19, built and tested locally)

- [x] `apps/door` on `ssh2`, running the CLI app per session (`pnpm door`, `ssh -p 2222 localhost`)
- [x] Custodial keepers per SSH key, recovery phrases sealed with AES-256-GCM under a master key; watch-only guests without a key
- [x] Take your keeper home (You → K shows the phrase for `watchfire import`)
- [x] One paced write budget per server for the whole door
- [x] Who's online, sysop announcements (`motd.txt`)
- [x] Limits: sessions in total and per address, idle timeout, session length; no shell, exec, SFTP or forwarding
- [x] Tested over real ssh: keeper and guest at once, light and feed through the door, quit, Ctrl+C, hangup, idle, the same key returning as the same keeper; refusals of exec, SFTP and both forwards
- [ ] Deploy: container image, host, domain; master key in a KMS
- [ ] Share work across sessions: one world poller per server list, one name cache
- [ ] Page a node; ban list

## Phase 4: dashboard

- [ ] `apps/dashboard` (Vite, static): world map, dying fires, news, today's numbers
- [ ] Dashboard origin added to `BEACON_CORS_ORIGINS` on our servers
- [ ] Candidate for the beacons.gg home page

## Phase 5: more

- [ ] Sparks (scouts plus three-phase "smoldering" fires; verify on a test server first)
- [ ] Mail one-liners
- [ ] Cross-game warm hands (`react` open to `vestige`)
- [ ] List the game in the beacons.gg directory
- [ ] Indexer, if fires outgrow a few hundred

## Open questions

- **npm name:** `watchfire` is taken on npm. Publish under a scope (`@<scope>/watchfire`); which scope?
- **Domain** for `ssh watchfire.<domain>` and the dashboard. Deferred: not needed until the phase 3 deploy. The door runs on `localhost:2222` and the dashboard uses a Vite dev proxy (no CORS) until then.
- **Tuning:** retuned for a small group (12h base, +4h per log, 12 logs, ember at 5; see game-design.md). Still needs a playtest.
- **Servers:** stay on `9q72` alone, or add regional servers? Each must admit `watchfire-door`.
- **Spike rooms on `9q72`:** one probe room never closes on its own. Remove it from the console when convenient.
