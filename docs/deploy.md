# Deploying the door

`compose.yaml` runs two services: `door` (the image: `door.mjs` plus the website, on `node:24-bookworm-slim`, as uid 1000) and `db` (`postgres:18-alpine`). The door listens on **2222** (the game, ssh) and **8080** (the website). What the door does: [ssh-door.md](ssh-door.md).

## First start

```sh
cp .env.example .env
echo "WATCHFIRE_MASTER_KEY=$(openssl rand -hex 32)" >> .env
echo "WATCHFIRE_DB_PASSWORD=$(openssl rand -hex 24)" >> .env
docker compose up -d --build
```

**Back up `WATCHFIRE_MASTER_KEY` off the host.** It seals every keeper's recovery phrase and lives nowhere else. Lose it and every keeper is lost. The database password is fixed when `db` first initializes its volume.

The build needs only public npm. To run a prebuilt image instead, push it to a registry and set `WATCHFIRE_IMAGE`.

For a LAN-only door, reserve the host's address and don't forward the ports. The door still needs outbound internet to reach the Beacon servers.

## Dokploy

Make it a **Docker Compose** app, not Stack: Swarm can't source secrets from the environment. Put `WATCHFIRE_MASTER_KEY`, `WATCHFIRE_DB_PASSWORD` and any settings below in its Environment tab. Publish 2222 as raw TCP, not through the HTTP proxy. 8080 can go through the proxy.

## Settings

`compose.yaml` hands the door the settings below and its limits (`WATCHFIRE_DOOR_MAX_*`, `_IDLE_MINUTES`, `_WRITES_PER_MINUTE`) from `.env`, by name, so the secrets reach it only as files. For any other setting in [ssh-door.md](ssh-door.md#run-it), add it under the door's `environment:`. A blank value means the default.

| Setting | Default | |
| --- | --- | --- |
| `WATCHFIRE_DOOR_PUBLIC_PORT` | `2222` | Host port for ssh, also used in the website's join command |
| `WATCHFIRE_WEB_PUBLIC_PORT` | `8080` | Host port for the website |
| `WATCHFIRE_JOIN` | `ssh -p <port> <address the visitor used>` | Override the join command the website shows |
| `WATCHFIRE_SERVERS` | `https://9q72.beacons.gg` | Servers a new keeper starts with, comma-separated |
| `WATCHFIRE_IMAGE` | `watchfire-door:latest` | Image name, for a prebuilt image |

The container runs in UTC; a door day is a UTC day.

## Data

Postgres holds everything but the master key: the host key, keepers (sealed), motd, bans and the website's watch log. `db` isn't published.

```sh
docker compose exec -T db pg_dump -U watchfire watchfire | gzip > door-$(date +%F).sql.gz   # backup
docker compose exec db psql -U watchfire                                                   # look inside
```

To restore, load the dump into an empty database before the door starts (the door creates its tables on connect):

```sh
docker compose down && docker volume rm watchfire_db-data
docker compose up -d --wait db
gunzip -c door-….sql.gz | docker compose exec -T db psql -q -v ON_ERROR_STOP=1 -U watchfire watchfire
docker compose up -d
```

Losing the host key gives every returning player a "host key changed" warning, so restore rather than start fresh.

**Files instead of Postgres:** set `COMPOSE_FILE=compose.yaml:compose.files.yaml` in `.env`. Then `db` doesn't run, no password is needed, and data goes in the `door-data` volume at `/data`. To move a files door into Postgres: `docker compose run --rm -v watchfire_door-data:/old door node door.mjs import /old`, then `docker compose restart door`.

**A Postgres elsewhere:** set `COMPOSE_FILE=compose.yaml:compose.external-db.yaml` and `WATCHFIRE_DOOR_DATABASE_URL=postgres://watchfire@<host>:5432/watchfire` in `.env`, with `WATCHFIRE_DB_PASSWORD` as that database's password. No local `db` runs. Without Compose, give the image `WATCHFIRE_DOOR_DATABASE_URL` (password in the URL, or `PGPASSWORD`) and `WATCHFIRE_DOOR_MASTER_KEY`.

Run one door per database: the one-session-per-keeper check lives in the door's memory.

## Website only

To serve the site without an ssh door on that machine (say, a public site for a door at home), set in `.env`:

```sh
COMPOSE_FILE=compose.yaml:compose.site.yaml
WATCHFIRE_JOIN=ssh -p 2222 door.example.com    # the door it advertises; unset hides "Join"
```

Only 8080 is published. No database, master key or keepers; the watch log goes in the `site-data` volume. It reads the world from the same Beacon servers (`WATCHFIRE_SERVERS`), so it shows what the door's players see.

## Sysop commands

```sh
docker compose exec door node door.mjs motd "The Edinburgh fire needs logs!"   # "" clears it
docker compose exec door node door.mjs ban SHA256:… spamming pages             # a key, address or CIDR range
docker compose exec door node door.mjs unban SHA256:…
docker compose exec door node door.mjs bans
```

Bans apply within 10 seconds. Key fingerprints are in the `session-start` log lines (`"who"`). To update: `git pull && docker compose up -d --build`. A restart shows everyone out, so warn them in the motd first.

## Networking

Per-address limits (`MAX_PER_IP`) and IP bans need players' real source addresses. Don't put the ssh port behind anything that rewrites them (an HTTP proxy, or a TCP proxy without PROXY protocol). On Docker Desktop, and for connections from the host itself, every caller shows up as the bridge gateway (`172.x.0.1`). If the logs show that for everyone, use `network_mode: host`.
