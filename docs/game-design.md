# Game design

> Somewhere in the world, a fire is about to go out. You have three logs today.

Watchfire is a door game: a small, persistent, turn-limited game you drop into for a minute, like the games on 1990s bulletin boards. Every fire sits at a real place. A fire burns for a while on its own, each log pushes its "out" time later, and once it's out it's ash. Players come in, read the news ("The fire on Calton Hill went dark at 03:12 after 19 hours"), spend their logs, and leave.

## What we want people to feel

- **Ritual.** Like checking a door game each morning: what burned, what died, who kept watch.
- **Shared stakes.** Nobody can keep a fire alive alone with three logs a day. Fires live because strangers chose them.
- **Place.** "Calton Hill, Edinburgh", not a coordinate.
- **Speed.** A full visit takes under a minute.

## Pillars

1. **One obvious action.** Feed a fire. Everything else is optional.
2. **The world moves while you're away.** Fires die on their own. The news tells you what happened.
3. **The server holds the rules.** Every rule that matters between players is in the room policy, so a modified client can't cheat it (see [beacon-integration.md](beacon-integration.md#what-the-server-enforces-and-what-it-doesnt)).
4. **Zero setup.** Download one file and run it, or `ssh` in to a door. No installer, no sign-up.

## Why a terminal game

We first considered a web game and decided against it:

- **Identity friction.** Writing to Beacon needs a wallet. In a browser that means a passphrase prompt, which kills "in and out in 30 seconds." The game on a player's own computer creates their keys silently on first run and keeps them in a file only the player can read (and asks them, once, to write down the twelve words that back it up).
- **Fit.** Door games were always terminal games. The ANSI look is the point, not a constraint.
- **The website still gets its moment.** Reads from a Beacon server are open, so a read-only website needs no wallet at all.

## Core loop

1. **Log in.** See the banner, the news since your last visit, and your logs left today.
2. **Look around.** The nearest fires to your watch place, and the fires closest to going out anywhere.
3. **Act.** Spend up to three logs: feed fires, or light a new one. Optionally warm your hands at a fire or collect an ember.
4. **Leave.** Under a minute.

## Rules

| Rule | Value (starting tuning) | Enforced by |
| --- | --- | --- |
| A new fire burns on its own for | 12 hours | server |
| Each log pushes "out" back by | 4 hours | server |
| Most logs a fire holds | 12, so a fire lives at most 60 hours | server |
| Lighting a fire lays the kindling, its first log | 1 log | client (the kindling is a normal contribute) |
| Only logs go on a fire | items of class `log` | server |
| A log counts as one, whatever it claims to weigh | `count`, not `sum` | server |
| Logs per player per day | 3 | client only |
| A keeper (anyone who added a log) may collect one ember | once the fire holds 5 logs | server |
| Embers per keeper per fire | 1 | server |
| Feeding, embers | only while burning | server |
| Raking the ashes (your logs back, and a cinder) | only once it's ash, once per keeper, for 2 days | server |
| Warm your hands | anyone, from any Beacon game, once per fire | server |

Lighting a fire costs a log, so "light a new one" and "feed one" draw from the same three.

Because the out time is `placedAt + 12h + logs × 4h`, a log counts the same whenever you add it. A fire that runs out of logs before its deadline catches up simply goes dark. Every fire dies within 60 hours, so the world turns over and someone always has to relight.

### Tuned for a small group

The starting numbers assume a handful to a few dozen players:

| Keepers on a fire | What happens |
| --- | --- |
| 1 | Lighting plus 2 logs = 24h, so the fire reaches tomorrow. Alone they add 12h a day against a 24h day, so the fire dies around hour 36. Ember on day 2. |
| 2 | 6 logs a day = 24h a day: they keep pace with the clock and can run the fire to its 60h cap. Ember on day 1. |
| 3+ | The fire fills to 12 logs on day 1 or 2 and burns out at hour 60. More keepers mean more embers, not a longer fire. |

So one player can always keep something going, and it takes two to make a fire last. With more players we can shorten `secPerLog` and raise `capacity`.

The numbers live in `FIRE_TUNING` (`packages/core/src/tuning.ts`). They're frozen into each fire when it's lit, so retuning affects only new fires.

### Why three logs a day is client-only

Beacon rooms can't count per-player actions across rooms or days. A modified client could add more logs, but each fire's capacity caps the damage at "this fire burns its full 60 hours." We accept that.

## Where you are

On first run the game asks **"Where do you keep watch?"** and matches the answer against a bundled list of every town of 1,000 people or more ("St" and "Saint", "Mt" and "Mount" both work). For somewhere smaller, like a crater in a desert, a player types its "lat, lng". That place is your watch place: the center of "nearest fires." Players can light fires anywhere, not only near home. Beacon doesn't check a player's physical location, and for a terminal game the map is the board.

Fire names come from the lighter ("The Lantern on Calton Hill"), defaulting to "The fire at <city>". Each fire is labelled with the nearest town from the bundled list ("Hell, Trøndelag, Norway"), or a much bigger one barely farther, worked out offline. The fire screen, the main screen's nearest fires and the World list all show it, shortened to fit narrow terminals. The server's geocode service (`getGeocode`, available on `9q72`) could add neighborhoods later. Fires are placed within 800 m of the chosen city's center, so fires in one city don't stack on one point.

## Screens

- **Main:** an animated fire header, the counts, the fires nearest your watch place, logs left today, what happened since your last visit, and the keys. When you have logs lying in the ashes of a fire you kept, a line says so and **A** opens it.
- **Fire:** a fire's name, place, server, burn bar, keepers, warmth and embers taken, and its moves (feed, warm hands, take an ember, rake the ashes).
- **World:** every burning fire, closest to going out first, with where it is and (with several servers) its server; then the dark fires you can still rake. A dark fire you have nothing to collect from isn't listed. **F** filters to one server.
- **Light:** name a new fire and pick its place. When more than one of your servers covers the place, it asks which one holds the fire, defaulting to the one that covers it most closely.
- **News:** what happened since your last visit.
- **You:** your name (your Beacon profile name, or your keeper name until you set one), your record, your embers (one per fire you tended past 5 logs: the long-term score), and kilometres or miles. At a door, also your keeper's recovery phrase, to take it home.
- **Servers:** the Beacon servers you read fires from; play or watch each; membership on members-only servers, with **J** to ask to join; **+**/**-** priority; latency; add one by address or from the beacons.gg directory.
- **Online** (at a door): who's on each node and what they're doing; page one of them a line.
- **Help** and **Watch place** (change where you keep watch).

Keyboard only, with single-key shortcuts as in door games. Every screen works at 80×24 and grows to fill a bigger terminal.

## The daily news

Door games lived on their news bulletins. The news is built by the client from what it reads, with no backend:

- fires lit, fed past milestones (5 logs, full), and gone dark (with total burn time and keeper count);
- embers collected;
- record fires (longest burn this week, most keepers).

On login, and every 30 seconds after, the client reads the fires in view, compares them with the last snapshot it saved, and writes the difference as prose. The fire you have open updates live over the socket.

## Embers and ashes

Embers are the collectible: proof you helped a fire reach 5 logs. Each ember's signed `birth` names its fire. Raking the ashes returns your own logs from a dead fire, a record of fires you saw to the end, and hands you a cinder from its pool. Both show on your profile screen.

The cinders are also what keep a dark fire around for its keepers. Beacon closes a room in its last phase as soon as nobody is owed anything from its pools, so before cinders a fire that never reached 5 logs, or whose keepers had all taken their embers, vanished the moment it went dark and nobody could rake it. Every keeper who hasn't raked is owed a cinder, so the ashes now stay until the last keeper rakes, or for 2 days.

## Warm hands

A reaction with the target set to the fire's kindling log. One per player per fire, so "warmth" counts distinct visitors. It costs nothing and is the zero-commitment way to take part.

It's also the one thing players of other Beacon games can do at a fire. The fire's policy opens `react`, and only `react`, to every game, so a player of a map game passing a fire can stop and warm their hands, and the keepers see the warmth go up. Feeding, embers and raking stay Watchfire's. How another game does it: [beacon-integration.md](beacon-integration.md#warming-hands-from-another-game).

## Ideas for later

### Sparks

Send a spark from a burning fire to light a new fire somewhere else. The spark is a Beacon scout: everyone watching sees it fly across the map. Proposed mechanics, not yet verified on a server:

- The sender places the new fire immediately with a three-phase policy: `smoldering → burning → ash`, where `burning` starts at `placedAt + travelTime`. The server enforces the arrival: nobody can feed a fire before its spark lands.
- The scout's report shows the spark in flight. Speed is the client's own rule (scout speed is not server-checked), but the arrival time is fixed in the room policy, so a faster-flying client changes nothing.
- A spark costs a log from the sending fire's keeper.

### Mail

Beacon's mailbox (256-character notes, available on `9q72`) is a natural fit for door-game one-liners: "thanks for keeping my fire alive."

### And more

- A playtest with a small group, to check the tuning.
- Signed and notarized executables, so players don't have to unblock them; install from Homebrew, winget or Scoop.
- A public door, for players on phones or who'd rather not download.
- A static website that reads Beacon directly (it needs its origin in each server's `BEACON_CORS_ORIGINS`), and an indexer if fires outgrow a few hundred.

## Tone and copy

Short, warm, slightly ominous. Fires "go dark," not "expire." Players are "keepers." The game never shows a server error as raw text: `phase` reads as "That fire's gone out," `full` as "That fire can't take another log."
