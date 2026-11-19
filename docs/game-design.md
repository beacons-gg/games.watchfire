# Game design

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
| Raking the ashes (your logs back, as a record) | only once it's ash, once per keeper, for 2 days | server |
| Warm your hands | anyone, once per fire | server |

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

On first run the game asks **"Where do you keep watch?"** and matches the answer against a bundled city list. That place is your watch place: the center of "nearest fires." Players can light fires anywhere, not only near home. Beacon doesn't check a player's physical location, and for a terminal game the map is the board.

Fire names come from the lighter ("The Lantern on Calton Hill"), defaulting to "The fire at <city>". Underneath, each fire is labelled with the nearest city from the bundled list, worked out offline. The server's geocode service (`getGeocode`, available on `9q72`) could add neighborhoods later. Fires are placed within 800 m of the chosen city's center, so fires in one city don't stack on one point.

## Screens

```
╔═════════ WATCHFIRE ═════ node 07 ═════════╗
  214 fires burning · 9 went dark overnight
  Nearest: Calton Hill, Edinburgh
    ▓▓▓▓▓▓░░░░  out in 3h12m · 17 keepers
  Logs left today: 3
  [F]eed fire  [L]ight new  [S]end spark
  [N]ews  [W]arm hands  [Q]uit
╚═══════════════════════════════════════════╝
```

- **Main:** an animated ANSI fire header, counts, your nearest fires, logs left, and keyboard shortcuts.
- **Fire:** a fire's name, place, burn bar, keepers, warmth, embers taken, and its actions.
- **World:** fires grouped by region, sorted by time left. "Dying fires" first.
- **News:** the log of what happened since your last visit.
- **You:** your name (your Beacon profile name, or your keeper name until you set one), your record, and your embers: one per fire you tended past 5 logs. The long-term "score."
- **Servers:** the Beacon servers you read fires from; play or watch each; membership on members-only servers, with J to ask to join; +/- priority; latency; add by address or from the beacons.gg directory.
- **Light** asks which server holds the new fire when more than one of yours covers the place, defaulting to the one that covers it most closely.
- **World** shows each fire's server, and F filters to one server.
- **Ashes:** fires you tended that went dark, with how long they burned.

Keyboard only, with single-key shortcuts as in door games. Every screen works at 80×24 and grows to fill a bigger terminal.

## The daily news

Door games lived on their news bulletins. The news is built by the client from what it reads, with no backend:

- fires lit, fed past milestones (5 logs, full), and gone dark (with total burn time and keeper count);
- embers collected;
- record fires (longest burn this week, most keepers).

On login the client reads the fires in view, compares them with the last snapshot it saved locally, and writes the difference as prose. Live deltas over the socket add lines while you're logged in.

## Embers and ashes

Embers are the collectible: proof you helped a fire reach 5 logs. Each ember's signed `birth` names its fire. Raking the ashes returns your own logs from a dead fire, a record of fires you saw to the end. Both show on your profile screen.

## Warm hands

A reaction with the target set to the fire's kindling log. One per player per fire, so "warmth" counts distinct visitors. It costs nothing and is the zero-commitment way to take part.

## Sparks (phase 5)

Send a spark from a burning fire to light a new fire somewhere else. The spark is a Beacon scout: everyone watching sees it fly across the map. Proposed mechanics, not yet verified on a server:

- The sender places the new fire immediately with a three-phase policy: `smoldering → burning → ash`, where `burning` starts at `placedAt + travelTime`. The server enforces the arrival: nobody can feed a fire before its spark lands.
- The scout's report shows the spark in flight. Speed is the client's own rule (scout speed is not server-checked), but the arrival time is fixed in the room policy, so a faster-flying client changes nothing.
- A spark costs a log from the sending fire's keeper.

## Mail (later)

Beacon's mailbox (256-character notes, available on `9q72`) is a natural fit for door-game one-liners: "thanks for keeping my fire alive."

## Tone and copy

Short, warm, slightly ominous. Fires "go dark," not "expire." Players are "keepers." The game never shows a server error as raw text: `phase` reads as "That fire's gone out," `full` as "That fire can't take another log."
