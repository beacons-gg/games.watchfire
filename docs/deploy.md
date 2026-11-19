# Deploying the door

The door ships as a Docker image: one bundled file (`door.mjs`, the game, the SDK and ssh2 inlined) on `node:24-bookworm-slim`, running as the unprivileged `node` user. `compose.yaml` at the repo root runs it. For what the door is and does, see [ssh-door.md](ssh-door.md).

## First start

On any host with Docker and Compose, from a checkout of this repo:

```sh
cp .env.example .env                                   # uncomment what you change; see below
mkdir -p secrets
openssl rand -base64 32 > secrets/master.key
chmod 444 secrets/master.key                           # the container's user (uid 1000) must read it
docker compose up -d --build
ssh -p 2222 <host>
```

`docker compose ps` shows it `healthy` once it's taking calls.

## Two secrets

| Secret | What it is | Where it goes |
| --- | --- | --- |
| **npm credentials** | Your `~/.npmrc`, with the token for the private `@beaconsgg` registry (`registry.example.com`). | **Build time only.** The build mounts it as a BuildKit secret, so it never lands in an image layer. Point `NPMRC` in `.env` at another file if it lives elsewhere. Build on a machine that has it (yours or CI) and push the image, or build on the host. |
| **The master key** | 32 random bytes, base64. Seals every keeper's recovery phrase. | `secrets/master.key` (`WATCHFIRE_MASTER_KEY_FILE` in `.env` to move it), mounted at `/run/secrets/master_key`. Never in the data volume. |

**Lose the master key and every keeper on the door is lost** (except players who took theirs home). Back it up somewhere other than the host, once, when you make it. It doesn't change after that.

Plain Compose mounts file secrets as they are on disk, so the file must be readable by uid 1000 (`chmod 444`, or `chown 1000`). The key is only as private as the host: anyone with root there can read it. Moving it to a KMS is on the roadmap.

## Settings (`.env`)

Compose reads `.env` for the port and secrets, and passes it whole to the door, so any setting from [ssh-door.md](ssh-door.md#run-it) works there. Leave a setting commented out to keep the door's own default.

| Setting | Default | |
| --- | --- | --- |
| `WATCHFIRE_DOOR_PUBLIC_PORT` | `2222` | The port players dial. `22` makes it plain `ssh <host>`: move the host's own sshd to another port first, and make sure you can still reach it. |
| `WATCHFIRE_SERVERS` | `https://9q72.beacons.gg` | Servers a new keeper starts with, comma-separated |
| `WATCHFIRE_DOOR_MAX_SESSIONS`, `_MAX_PER_IP`, `_IDLE_MINUTES`, `_MAX_MINUTES`, `_WRITES_PER_MINUTE` | 50, 5, 5, 60, 100 | As in [ssh-door.md](ssh-door.md#run-it) |
| `WATCHFIRE_IMAGE` | `watchfire-door:latest` | The image's name, to push it to a registry and pull it on the host |

Inside the container, `TZ=UTC` (a door day is a UTC day, and times on screen match it), and the door keeps its data in `/data`.

## The data volume

`door-data`, mounted at `/data`:

- `host_key`: the door's SSH host key, made on first start. Players' ssh clients remember it, so it must survive: losing it makes every returning player see a "host key changed" warning.
- `keepers/`: one folder per SSH key (its sealed wallet and its game state).
- `motd.txt`, `bans.txt`: the sysop's, below.

Back it up regularly, for example:

```sh
docker run --rm -v watchfire_door-data:/data -v "$PWD":/backup busybox tar czf /backup/door-data-$(date +%F).tgz -C /data .
```

The backup holds sealed keepers, useless without the master key, which is why the two are kept apart.

## Day to day

```sh
docker compose logs -f door                              # JSON lines: who came and went, pages sent, refusals
docker compose exec door sh -c 'echo "The Edinburgh fire needs logs!" > /data/motd.txt'
docker compose exec door sh -c 'echo "SHA256:… # spam" >> /data/bans.txt'   # takes effect within 10 s
```

Key fingerprints for bans are in the `session-start` log lines (`"who"`).

## Updating

```sh
git pull
docker compose up -d --build
```

A restart shows everyone out ("The door is closing for a moment. Come back soon."), so pick a quiet moment, and warn players in the motd beforehand. Keepers, the host key and bans live in the volume and carry over.

## Behind a firewall or load balancer

The door speaks SSH on one TCP port. Forward that port (TCP, no TLS termination, no HTTP proxy). Limits per address need the players' real addresses, so don't put it behind anything that rewrites the source address (a TCP proxy without PROXY protocol support will make every player look like one address and hit `MAX_PER_IP`).

How Docker publishes the port matters for the same reason. On a Linux host, callers from outside keep their real address. Connections from the host itself arrive from the bridge's gateway (`172.x.0.1`), and on Docker Desktop every caller does. If the logs show one gateway address for everyone, use `network_mode: host` (and drop `ports:`) so the door sees callers directly.
