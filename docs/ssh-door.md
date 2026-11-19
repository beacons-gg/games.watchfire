# The SSH door

```
$ ssh -p 2222 localhost          # today, locally
$ ssh watchfire.<domain>         # once deployed
```

No install, no sign-up: the most door-game way to play. BBS callers dialed in and the BBS launched the door. Here SSH is the dial-in and the door launches the game.

**Status: built and tested locally** (`apps/door`), not yet deployed. See [Not yet](#not-yet).

## Run it

```sh
pnpm door                                   # listens on :2222, keeps its data in ./.watchfire-door
ssh -p 2222 localhost                       # with your SSH key: your keeper
ssh -p 2222 -o PubkeyAuthentication=no localhost   # without one: a guest
```

| Setting | Default | What it does |
| --- | --- | --- |
| `WATCHFIRE_DOOR_HOME` | `./.watchfire-door` | Host key, master key, keepers, `motd.txt` |
| `WATCHFIRE_DOOR_PORT` / `_BIND` | `2222` / `0.0.0.0` | Where it listens |
| `WATCHFIRE_DOOR_MAX_SESSIONS` | `50` | Sessions at once; the next caller hears "the door is full" |
| `WATCHFIRE_DOOR_MAX_PER_IP` | `5` | Connections per address (one game per connection) |
| `WATCHFIRE_DOOR_IDLE_MINUTES` | `5` | No keystrokes for this long ends the session |
| `WATCHFIRE_DOOR_MAX_MINUTES` | `60` | The longest one session lasts |
| `WATCHFIRE_DOOR_WRITES_PER_MINUTE` | `100` | Beacon writes per server for the whole door (see [Rate limits](#rate-limits)) |
| `WATCHFIRE_DOOR_MASTER_KEY` | made once in `master.key` | 32 bytes, base64: seals every keeper's recovery phrase |
| `WATCHFIRE_SERVERS` | `9q72.beacons.gg` | Servers a new keeper starts with |
| `WATCHFIRE_FIRE_TYPE` | `watchfire` | Testing only: another room type, invisible to normal play |

`<home>/motd.txt` is the sysop's announcement: it greets every player as they arrive, and edits take effect for the next caller.

## How it works

- `apps/door/src/server.tsx`: an SSH server on `ssh2`. On `pty-req` + `shell` it renders the same Ink app as the local CLI (`watchfire/app`) into the channel. `window-change` resizes it; `COLORTERM`, if the client sends it, picks truecolor.
- `terminal.ts` gives Ink a stdin and stdout of its own, piped to and from the channel, that look like a terminal (`isTTY`, `columns`, `rows`, `setRawMode`, `resize`). There's no line discipline on the door's side of SSH, so stdout turns `\n` into `\r\n`; stdin notes each keystroke for the idle timeout.
- The door has no TTY of its own, so `door.ts` sets `FORCE_COLOR=3` before anything loads chalk. The animated flame picks truecolor or 256 colors per player from the `TERM` and `COLORTERM` their ssh sends, by the same rules as the local CLI (`detectColorDepth`). Most ssh clients don't send `COLORTERM`, so `xterm-256color` gets 256 colors; `SendEnv COLORTERM` in `~/.ssh/config` gets truecolor.
- **No shell, no exec, no SFTP, no X11, no port forwarding** (local or remote). All refused, and tested.
- Each session gets the lowest free node number, as on a BBS ("node 07").
- Logs are JSON lines on stdout: `listening`, `session-start` (node, address, key fingerprint or "guest", keeper DID), `session-end` (why: quit, hangup, idle, time; minutes), errors. Never keystrokes.

## Identity

The door is **custodial**: it holds a Beacon wallet for each player, because an SSH session can't sign anything with the player's own keys.

| How you connect | Who you are |
| --- | --- |
| With an SSH public key | A keeper. Any key is welcome: the key's SHA-256 fingerprint names a keeper the door creates on your first visit and finds again on every later one. The signature is checked, so only the key's holder gets in as that keeper. |
| Without a key (keyboard-interactive, or any password) | A guest: **watch only**. Guests see fires, the world and the news, but can't feed, light, warm hands, collect or join servers. They have no wallet, so they cost no write budget. |

"none" auth is refused on purpose, so ssh clients try their keys before falling back to keyboard-interactive.

- Each keeper lives in `<home>/keepers/<sha256 of the SSH key>/`: `keeper-key.json` (the SDK's wallet entries, recovery phrase included, each value sealed with AES-256-GCM under the door's master key) and `state.json` (watch place, logs today, embers, servers, last snapshot; no secrets).
- **Take your keeper home:** You → K shows the recovery phrase, after a warning, so a player can `watchfire import` on their own machine. Both copies can play as them afterwards; the door says so.
- **One session per keeper:** a second connection with the same key hears "Your keeper is already by the fire on node 03". Each session keeps its own copy of the keeper's state, so two at once would overwrite each other's embers and servers. Guests have no limit beyond the address limit.
- **A door day is a UTC day** (the door can't know each player's timezone), so logs reset at midnight UTC. Times on screen are in the door's timezone; run the door with `TZ=UTC` to match.

## Rate limits

Beacon limits signed writes **per address** (120 a minute by default, `BEACON_WRITE_RATE_LIMIT_MAX`), and every door player writes from the door's one address. The door passes every session a shared, paced `fetch` (`pacer.ts`): writes (anything but GET) to each server are spaced evenly to `WRITES_PER_MINUTE` (one every 0.6 s at 100), so a player usually sees "Laying a log…" a moment longer at most. When the queue for a server is more than 10 seconds deep, a write is turned away at once with Beacon's own over-budget answer, and the player sees "The wind's too strong. Try again in a moment." rather than waiting out the SDK's 15-second timeout. Reads aren't paced.

- For our own servers, raise `BEACON_WRITE_RATE_LIMIT_MAX` for the door's address and `WATCHFIRE_DOOR_WRITES_PER_MINUTE` with it.
- Players on other operators' servers share the default budget. Note this when we list the game.

## Things only the door can do

- **Who's online** (O on the main screen): every node, who's on it (keeper name, or "a guest"), how long, and what they're doing ("at a fire", "surveying the world"…).
- **Sysop announcements**: `motd.txt`.

## Security

- Host key: ed25519, made once in `<home>/host_key` (0600). Keep it with the data: players' ssh clients remember it.
- Master key: in `WATCHFIRE_DOOR_MASTER_KEY` or `<home>/master.key` (0600). Losing it loses every keeper the door holds (players who took theirs home keep them). Back it up separately from the data; move it to a KMS before real players arrive.
- Limits: sessions in total, sessions per address, idle timeout, maximum session length.
- All player text (fire names, names, the motd) goes through `safeText` before it reaches a terminal.
- Run it as an unprivileged user (or in a container) with nothing but the game.

## Not yet

- **Deploy:** a container image and a host. Building the image needs the private `@beaconsgg` registry at build time (a build secret), or the bundled build.
- **Shared work across sessions:** each session runs its own world read every 30 seconds and its own name lookups. One poller per server list and one name cache would make a busy door much cheaper.
- **Page a node** (a one-line message to another session).
- **Ban list** by key fingerprint and address.
- The domain, and where the master key lives in production.
