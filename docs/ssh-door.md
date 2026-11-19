# The SSH door

```
$ ssh watchfire.<domain>
```

No install, no sign-up: the most door-game way to play. BBS callers dialed in and the BBS launched the door. Here SSH is the dial-in and our door server launches the game.

## How it works

- An SSH server in Node, using the `ssh2` library, listening on port 22 of its own host (or 2222 behind a port forward).
- On `pty-req` + `shell`, the door renders the same Ink app as the local CLI (`apps/cli`) into the SSH channel: the channel is the app's stdin/stdout, and `window-change` updates columns and rows and emits `resize`.
- No shell, no exec, no port forwarding, no SFTP. Every other channel request is refused.
- Each session gets a node number, as on a BBS ("node 07").

## Identity

The door is **custodial**: it holds a Beacon wallet for each player, because an SSH session can't sign anything with the player's own keys.

| How you connect | Who you are |
| --- | --- |
| With an SSH public key | A persistent keeper. The key's fingerprint maps to a wallet the door created on your first visit. |
| Without a key (password or keyboard-interactive, any input) | A guest: **watch only**. Guests see fires, the world and the news, but can't feed, light, warm hands or collect. They have no wallet, so they cost no write budget. |

- Wallets (recovery phrases) are encrypted at rest with a door master key, which moves to a KMS later.
- **Take your keeper home:** a menu item shows the recovery phrase so a player can run `watchfire import` locally and own their keys locally. After export, the door marks the account as exported and warns that both copies can sign.
- One account per SSH key. A player with several keys gets several keepers unless they link them (later).

## Rate limits

Beacon limits signed writes **per address** (120 a minute by default, `BEACON_WRITE_RATE_LIMIT_MAX`). Every door player writes from the door's one IP, so the door shares one budget:

- For our own servers, raise the limit for the door's address (operator setting).
- In the door, queue writes per server and show "the fire crackles…" while a write waits, instead of failing.
- Players on other operators' servers share the default budget. Note this when we list the game.

Per-account limits (120 room ops a minute) are unaffected.

## Things only the door can do

The door sees every live session, which a Beacon client can't. That buys the classic BBS extras:

- **Who's online:** the nodes in use and what each keeper is doing ("node 03: Mira is feeding Calton Hill").
- **Page a node:** a one-line message to another live session.
- **Sysop announcements** on the login screen.

These live only in the door process and never touch Beacon.

## Security

- Run as an unprivileged user in a container. The process has nothing but the game.
- A persistent host key (stored like a secret) so returning players don't get host-key warnings.
- Limits: sessions per IP, total sessions, an idle timeout (5 minutes), and a maximum session length.
- Sanitize all player text (fire names, pages, announcements) before it reaches a terminal. See [beacon-integration.md](beacon-integration.md#untrusted-text).
- Log connections (fingerprint, IP, node, duration), never keystrokes.
- A ban list by key fingerprint and IP, separate from Beacon's account blocking.

## Open questions

- The domain and host for `ssh watchfire.<domain>`. Not needed until we deploy; locally the door runs as `ssh -p 2222 localhost`.
- Where the door master key lives once we leave the prototype.
