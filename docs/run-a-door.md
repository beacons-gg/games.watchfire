# Running a door

```
$ ssh -p 2222 watchfire.example.com
```

A door is the old BBS way in: callers dialed the board and the board launched the game. Here ssh is the dial-in and the door launches Watchfire, so anyone with a terminal can play with nothing to install, from a phone too. Each door also serves the game's website, with the world's fires live.

A door isn't a game server. It connects to the same Beacon servers as everyone else, so its players share one world with players running the game on their own computers. You don't need to run a Beacon server.

## Start one with Docker

`compose.yaml` runs two services: `door` (one image: the door and its website, on `node:24-bookworm-slim`, as uid 1000) and `db` (`postgres:18-alpine`). The door listens on **2222** (the game, over ssh) and **8080** (the website).

```sh
cp .env.example .env
echo "WATCHFIRE_MASTER_KEY=$(openssl rand -hex 32)" >> .env
echo "WATCHFIRE_DB_PASSWORD=$(openssl rand -hex 24)" >> .env
docker compose up -d --build
ssh -p 2222 localhost
```

**Back up `WATCHFIRE_MASTER_KEY` off the host.** It seals every keeper's recovery phrase and lives nowhere else: lose it and every keeper the door holds is lost (players who took theirs home keep them). The database password is fixed when `db` first initializes its volume.

The build needs only public npm. To run a prebuilt image instead, push it to a registry and set `WATCHFIRE_IMAGE`. For a LAN-only door, reserve the host's address and don't forward the ports; the door still needs outbound internet to reach the Beacon servers.

**Dokploy:** make it a **Docker Compose** app, not Stack (Swarm can't source secrets from the environment). Put `WATCHFIRE_MASTER_KEY`, `WATCHFIRE_DB_PASSWORD` and any settings in its Environment tab. Publish 2222 as raw TCP, not through the HTTP proxy; 8080 can go through the proxy.

**Without Docker:** `pnpm door` runs one from a checkout, keeping its data in `./.watchfire-door`. `pnpm -C apps/door run build` bundles it into one file, `apps/door/dist/door.mjs`, which runs anywhere with Node 24 and no install (`node door.mjs`).

## Settings

`compose.yaml` hands the door the common settings from `.env`, by name, and the secrets only as files. For any other setting, add it under the door's `environment:`. A blank value means the default.

| Setting | Default | What it does |
| --- | --- | --- |
| `WATCHFIRE_DOOR_PUBLIC_PORT` | the door's port (`2222`) | The port players dial, for the website's join command. In Compose, also the host port |
| `WATCHFIRE_WEB_PUBLIC_PORT` | `8080` | Compose only: the host port for the website |
| `WATCHFIRE_JOIN` | `ssh -p <port> <address the visitor used>` | The join command the website shows, if it should name something else |
| `WATCHFIRE_DOWNLOAD` | the latest GitHub release | Where the website's Download button points; `none` for no download |
| `WATCHFIRE_SERVERS` | `https://9q72.beacons.gg` | Beacon servers a new keeper starts with, comma-separated |
| `WATCHFIRE_DOOR_MAX_SESSIONS` | `50` | Sessions at once; the next caller hears "the door is full" |
| `WATCHFIRE_DOOR_MAX_PER_IP` | `5` | Connections per address (one game per connection) |
| `WATCHFIRE_DOOR_IDLE_MINUTES` | `5` | No keystrokes for this long ends the session |
| `WATCHFIRE_DOOR_MAX_MINUTES` | `60` | The longest one session lasts |
| `WATCHFIRE_DOOR_WRITES_PER_MINUTE` | `100` | Beacon writes per server for the whole door (see [Rate limits](#rate-limits-and-shared-reads)) |
| `WATCHFIRE_DOOR_MASTER_KEY` / `_FILE` | made once in `master.key` (files only) | 32 bytes, hex or base64, or a file holding it: seals every keeper's recovery phrase |
| `WATCHFIRE_DOOR_DATABASE_URL` | | `postgres://user@host:5432/db`: keep everything in Postgres (the Docker default) |
| `WATCHFIRE_DOOR_DATABASE_PASSWORD_FILE` | | A file holding the database's password, if it isn't in the URL |
| `WATCHFIRE_DOOR_HOME` | `./.watchfire-door` | Where a door kept in files keeps them |
| `WATCHFIRE_DOOR_PORT` / `_BIND` | `2222` / `0.0.0.0` | Where it listens. Port `0`: no door, the website alone |
| `WATCHFIRE_WEB_PORT` | `8080` | The website (`0`: none) |
| `WATCHFIRE_WEB_ROOT` | `apps/dashboard/dist` | The built website (`/app/web` in the image) |
| `WATCHFIRE_IMAGE` | `watchfire-door:latest` | Compose only: the image, for a prebuilt one |
| `WATCHFIRE_FIRE_TYPE` | `watchfire` | Testing only: another room type, invisible to normal play |

The container runs in UTC, and a door day is a UTC day.

## Sysop commands

```sh
docker compose exec door node door.mjs motd "The Edinburgh fire needs logs!"   # "" clears it
docker compose exec door node door.mjs ban SHA256:… spamming pages             # a key, an address or a range, and why
docker compose exec door node door.mjs unban SHA256:…
docker compose exec door node door.mjs bans
```

From a checkout, the same commands are `pnpm door motd …` and so on (`pnpm door help` lists them). The motd greets every player as they arrive. Bans and the motd apply within 10 seconds, with no restart.

A ban is an SSH key (as the `session-start` log names it, `"who"`), an address, or a range (IPv4 or IPv6). A banned address is turned away before it can sign in; a banned key hears "This key isn't welcome here."; anyone already on who matches is shown out ("The door has closed to you."). A banned key can still come in without it, as a guest who can only watch, unless its address is banned too. A door kept in files keeps the list in `<home>/bans.txt`, one entry a line, `#` for comments, which can be edited by hand.

To update: `git pull && docker compose up -d --build`. A restart shows everyone out, so warn them in the motd first.

## Data and backups

The door keeps its host key, the keepers (their recovery phrases sealed under the master key), the motd and bans, and the website's watch log. Everything but the master key, which never goes in the database.

**In Postgres** (the Docker default), in two tables the door makes on first connect: `door_values` and `keepers` (one row per SSH key). `db` isn't published.

```sh
docker compose exec -T db pg_dump -U watchfire watchfire | gzip > door-$(date +%F).sql.gz   # backup
docker compose exec db psql -U watchfire                                                   # look inside
```

To restore, load the dump into an empty database before the door starts:

```sh
docker compose down && docker volume rm watchfire_db-data
docker compose up -d --wait db
gunzip -c door-….sql.gz | docker compose exec -T db psql -q -v ON_ERROR_STOP=1 -U watchfire watchfire
docker compose up -d
```

Losing the host key gives every returning player a "host key changed" warning, so restore rather than start fresh. Run one door per database: the one-session-per-keeper check lives in the door's memory.

**In files:** set `COMPOSE_FILE=compose.yaml:compose.files.yaml` in `.env`. Then `db` doesn't run, no password is needed, and the data goes in the `door-data` volume (`host_key`, `master.key`, `keepers/`, `motd.txt`, `bans.txt`, `world.json`). To move a files door into Postgres: `docker compose run --rm -v watchfire_door-data:/old door node door.mjs import /old`, then `docker compose restart door`.

**A Postgres elsewhere:** set `COMPOSE_FILE=compose.yaml:compose.external-db.yaml` and `WATCHFIRE_DOOR_DATABASE_URL=postgres://watchfire@<host>:5432/watchfire` in `.env`, with `WATCHFIRE_DB_PASSWORD` as that database's password.

## The website alone

To serve the website without a door on that machine (the game's public site, say, or a public site for a door at home), set in `.env`:

```sh
COMPOSE_FILE=compose.yaml:compose.site.yaml
WATCHFIRE_JOIN=ssh -p 2222 door.example.com    # a door it advertises; unset, it offers only the download
```

Only 8080 is published. No database, master key or keepers; the watch log goes in the `site-data` volume. It reads the same Beacon servers (`WATCHFIRE_SERVERS`), so it shows what players see.

## Networking

Per-address limits and IP bans need players' real source addresses. Don't put the ssh port behind anything that rewrites them (an HTTP proxy, or a TCP proxy without PROXY protocol). On Docker Desktop, and for connections from the host itself, every caller shows up as the bridge gateway (`172.x.0.1`); if the logs show that for everyone, use `network_mode: host`.

## How it works

`apps/door` is an SSH server (`ssh2`) that renders the same Ink app as the game on a player's computer into each SSH channel, with a `Session` per player.

### Who you are

The door is **custodial**: it holds a Beacon wallet for each player, because an SSH session can't sign anything with the player's own keys.

| How you connect | Who you are |
| --- | --- |
| With an SSH public key | A keeper. The key's SHA-256 fingerprint names a keeper the door creates on your first visit and finds again on every later one. The signature is checked, so only the key's holder gets in as that keeper. |
| Without a key | A guest: **watch only**. Guests see everything but can't feed, light, warm hands, collect or join servers. They cost no write budget. |

- "none" auth is refused on purpose, so ssh clients try their keys before falling back to keyboard-interactive.
- **Take your keeper home:** You → K shows the recovery phrase, after a warning, so a player can `watchfire import` it on their own computer.
- **One session per keeper:** a second connection with the same key hears "Your keeper is already by the fire on node 03".
- Each session gets the lowest free node number, as on a BBS ("node 07").

### Rate limits and shared reads

Beacon limits signed writes **per address** (120 a minute by default), and every door player writes from the door's one address. So the door hands every session one shared `fetch`:

- **Shared reads** (`shared.ts`). Sessions reading the world at once share one request, and an answer from the last 10 seconds is given again. A move forgets what it changed, so players see their own moves at once. Fifty players watching a hundred fires cost the servers about what a handful do.
- **Paced writes** (`pacer.ts`). Writes to each server are spaced evenly to `WATCHFIRE_DOOR_WRITES_PER_MINUTE`. When a server's queue is more than 10 seconds deep, a write is turned away at once and the player sees "The wind's too strong. Try again in a moment."

On a Beacon server you run, raise `BEACON_WRITE_RATE_LIMIT_MAX` for the door's address, and `WATCHFIRE_DOOR_WRITES_PER_MINUTE` with it.

### Only at a door

- **Who's online** (O on the main screen): every node, who's on it, and what they're doing.
- **Pages:** on who's online, pick a node and P to send it one line, with a beep. Keepers can page, once every 5 seconds. The door logs that a page was sent, never what it said.
- **The motd**, from the sysop.

### The website

The door serves `apps/dashboard`: what Watchfire is, how to start playing (the download, and the door's `ssh` command), and the world live. `world.ts` reads the world every 30 seconds through the door's shared reads and keeps the watch log; `web.ts` serves the site and `GET /api/world`, so the browser needs no Beacon SDK. `pnpm dashboard` runs the site with live reload against a local `pnpm door`.

### Colour and terminals

The door has no TTY of its own, so `terminal.ts` gives each session a stdin and stdout that look like one, and the flame picks truecolor or 256 colours from the `TERM` and `COLORTERM` the player's ssh sends. Most ssh clients don't send `COLORTERM`; `SendEnv COLORTERM` in `~/.ssh/config` gets truecolor.

## Security

- **No shell, no exec, no SFTP, no X11, no port forwarding.** All refused, and tested.
- **Host key:** ed25519, made once and kept with the data. Players' ssh clients remember it.
- **Master key:** from the environment or a file, never in the database. Back it up apart from the data.
- **Limits:** sessions in total and per address, one game per connection, one session per keeper, the idle timeout and longest session, pages once every 5 seconds, and bans.
- **Player text** (fire names, names, pages, the motd) is stripped of control characters before it reaches a terminal.
- **Logs** are JSON lines on stdout (`listening`, `session-start`, `session-end`, errors), never keystrokes. Connections that never sign in aren't logged.
- Run it as an unprivileged user, or in a container, with nothing but the game.
