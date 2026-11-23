# Vision

## The pitch

> Somewhere in the world, a fire is about to go out. You have three logs today.

Watchfire is a door game: a small, persistent, turn-limited game you drop into for a minute, like the games on 1990s bulletin boards (Legend of the Red Dragon, TradeWars 2002). Every fire sits at a real place. A fire burns for a while on its own, each log pushes its "out" time later, and once it's out it's ash. Players log in, read the overnight news ("The fire on Calton Hill went dark at 03:12 after 19 hours"), spend their logs, and leave.

## Why a terminal game

We first considered a web game for the beacons.gg home page and decided against it:

- **Identity friction.** Writing to Beacon needs a wallet. In a browser that means a passphrase prompt, which kills "in and out in 30 seconds." The game on the player's own computer creates their keys silently on first run and keeps them in a file only the player can read (and asks them, once, to write down the twelve words that back it up).
- **Fit.** Door games were always terminal games. The ANSI look is the point, not a constraint.
- **The website still gets its moment.** Reads from a Beacon server are open, so a read-only website needs no wallet at all. That website is the piece that could sit on the beacons.gg home page: "the network, live."

## What we want people to feel

- **Ritual.** Like checking a door game each morning: what burned, what died, who kept watch.
- **Shared stakes.** Nobody can keep a fire alive alone with three logs a day. Fires live because strangers chose them.
- **Place.** "Calton Hill, Edinburgh" and not a coordinate. Fires light up real places on the map.
- **Speed.** A full visit takes under a minute.

## Design pillars

1. **One obvious action.** Feed a fire. Everything else is optional.
2. **The world moves while you're away.** Fires die on their own. The news log tells you what happened.
3. **The server holds the rules.** Every rule that matters between players is in the room policy, so a modified client can't cheat it (see [beacon-integration.md](beacon-integration.md#what-the-server-enforces-and-what-it-doesnt)).
4. **Zero setup.** Download one file and run it, or `ssh` in to a door. No installer, no sign-up.

## Who it's for

- Terminal people and BBS nostalgics: the core audience for a door game.
- Beacon's own audience: Watchfire is a working example of a Beacon game built from nothing but room policies, in a different shape from a phone map game.

## What it shows off about Beacon

- Rooms whose timing responds to their contents (each log moves the deadline).
- Server-enforced rewards (one ember per keeper, only past a threshold).
- Open reads: the website and the in-game world view need no backend.
- Live updates over the socket.
- Cross-game play: players of any Beacon game can warm their hands at a fire, and nothing more.
- Later: scouts (sparks flying between fires).
