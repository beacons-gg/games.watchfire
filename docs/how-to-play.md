# How to play Watchfire

> Somewhere in the world, a fire is about to go out. You have three logs today.

Watchfire is a game you play for about a minute a day, in a terminal window, like the "door games" people played on dial-up bulletin boards in the 1990s. Fires burn at real places around the world. Every day you get three logs to keep them alive. Fires that nobody tends go dark.

There are two ways in: **download the game** and play on your own computer (most players), or **visit a door** over ssh, with nothing to download (also the way in from a phone). It's the same game and the same fires either way.

## Playing on your own computer

Download Watchfire from the [latest release](https://github.com/beacons-gg/games.watchfire/releases/latest): one file for your computer, nothing to install.

| Computer | Download |
| --- | --- |
| Windows (64-bit) | `watchfire-<version>-windows-x64.zip` |
| Mac with Apple silicon (M1 and later) | `watchfire-<version>-macos-arm64.tar.gz` |
| Mac with an Intel processor | `watchfire-<version>-macos-x64.tar.gz` |
| Linux (64-bit) | `watchfire-<version>-linux-x64.tar.gz` |
| Linux on ARM (64-bit) | `watchfire-<version>-linux-arm64.tar.gz` |

**Windows.** Unzip it (right-click, *Extract All*). Open the unzipped folder, right-click inside it and choose *Open in Terminal* (on Windows 10, Shift + right-click, then *Open PowerShell window here*), and run `.\watchfire.exe`. Windows may say it protected your PC from an unknown app: choose *More info*, then *Run anyway*.

**Mac.** Double-click the download to unpack it. Open Terminal (Spotlight, type *Terminal*), type `cd ` and drag the unpacked folder onto the window, then press Enter. The game isn't notarized by Apple yet, so the first time only, let your Mac run it, then start it:

```sh
xattr -d com.apple.quarantine watchfire
./watchfire
```

(Or try to run it once, then allow it under System Settings → Privacy & Security → *Open Anyway*.)

**Linux.** `tar -xzf watchfire-*-linux-x64.tar.gz && ./watchfire-*-linux-x64/watchfire`

Make the window big: the game needs at least 80 × 24 and uses whatever you give it.

**Your keeper lives on your computer.** The first time you play, the game makes your keeper and keeps it in your home folder (`~/.config/watchfire`; `watchfire --help` says exactly where). It's the only copy, so **back it up**: in the game, **Y** then **K** shows its recovery phrase, twelve words that *are* your keeper (or run `watchfire phrase`). Write them down somewhere safe and private. On a new computer, `watchfire import` and those words bring your keeper back, with its embers and fires. Until you've seen them, the main screen reminds you.

**New versions.** Once a day the game asks GitHub whether a newer version is out, and if one is, says so on the main screen. Download it the same way and run it: your keeper carries on. (`WATCHFIRE_NO_UPDATE_CHECK=1` turns the check off.)

## Visiting a door

A door is a computer someone runs for players to visit over **ssh**, a standard way to reach another computer. Nothing to install on a Mac, Linux or Windows 10/11. The door's website (its address, port 8080) shows the same world live, and how to come in.

1. **Open a terminal.** Mac: Spotlight, type *Terminal*. Windows: the Windows key, type *PowerShell*. Phone or tablet: install an ssh app such as **Termius**.
2. **The first time only, make a key:** `ssh-keygen -t ed25519`, then press Enter at each question. (In Termius: Keychain → Keys → Generate.)
3. **Come in:** `ssh -p 2222 <the door's address>`, as the website shows it. The first time, ssh asks whether to trust the door: type `yes`.

**At a door, your key is your keeper.** The door knows you by your ssh key: come back from the same computer and you're the same keeper. A different device (with a different key) is a different keeper. Without any key you come in as a **guest**: you can look at everything, but not lay logs. A door also has who's online (**O**) and pages; on your own computer you won't see those.

Make the window big: the game needs at least 80 × 24 and uses whatever you give it. On a phone, turn it sideways.

## Your first visit

The game asks **where you keep watch**: type a town or city and pick it from the list. Any town of 1,000 people or more is there; for somewhere smaller, type its "lat, lng" from any map. That's your home on the map: the main screen shows the fires nearest it. (It's only for the map. You can light and feed fires anywhere.)

## A day in Watchfire

1. **Look around.** The main screen shows how many fires are burning, the fires nearest you, and what happened since your last visit.
2. **Spend your logs.** You have **3 logs a day** (a new day starts at midnight UTC). Open a fire (its number, or the World list) and press **F** to lay a log on it, or press **L** on the main screen to light a new fire somewhere and name it. Lighting a fire costs one of your logs.
3. **Leave.** Press **Q**, or just close the window. The fires burn on without you. Come back tomorrow and read the watch log.

## The rules

| | |
| --- | --- |
| **Burning** | A new fire burns **12 hours** on its own. Every log adds **4 hours**. |
| **Full** | A fire holds **12 logs** at most, so every fire goes dark within **60 hours**. Someone always has to light the next one. |
| **Keepers** | Lay a log on a fire and you become one of its keepers. |
| **Embers** | Once a fire holds **5 logs**, each of its keepers may take **one ember** (**E** at the fire). Embers are your record of the fires you helped keep: see them under **Y**ou. |
| **Ashes** | When a fire goes dark, its keepers can **rake** their logs back from the ashes (**R**) for two days, and find a cinder with them: a record of the fires they saw to the end. The main screen tells you when you have ashes to rake (**A** opens the fire), and they're listed at the bottom of the World. |
| **Warm your hands** | Anyone, keeper or not, can warm their hands at a fire once (**W** at the fire), even players of other Beacon games passing by. It's free, and the fire shows how many have stopped by. |

**Working together.** One keeper's three logs a day add 12 hours, but a day is 24 hours: alone you can carry a fire into tomorrow, not forever. **Two keepers** keep pace with the clock. Pick fires other people are keeping, and tell them with a page.

**Nobody can cheat the fires.** The rules live inside each fire, on the Beacon server that holds it, and the server enforces them for everyone: no one can overfill a fire, take two embers, or feed a fire that's dark.

## Keys

| On the main screen | |
| --- | --- |
| **1**–**9** | Open one of the fires listed |
| **W** | The whole world, closest to going out first (and any ashes you can rake) |
| **A** | Open a dark fire whose ashes you can rake (shown only when there's one) |
| **L** | Light a new fire |
| **N** | The watch log |
| **Y** | You: your name, embers and record (**N** there to choose your name, **K** for your keeper's twelve words, **U** for miles or kilometres) |
| **O** | At a door: who's online; pick someone and **P** to page them a line |
| **P** | Change where you keep watch |
| **S** | Servers (the Beacon servers your fires come from) |
| **?** | The rules, in the game |
| **Q** | Leave |

| At a fire | |
| --- | --- |
| **F** | Feed it a log |
| **W** | Warm your hands |
| **E** | Take your ember (5 logs or more, keepers only) |
| **R** | Rake the ashes (once it's dark, keepers only) |
| **Esc** | Back |

## Good to know

- **One seat each (at a door).** You can be at the door in one window at a time. Sessions end after five idle minutes, and after an hour.
- **Your name.** You start with a made-up keeper name ("Sleepless Newt"). Choose your own under **Y**ou → **N**: it's your Beacon profile name, so other Beacon games can show it too.
- **Your twelve words.** Under **Y**ou → **K**, the game shows your keeper's recovery phrase: twelve words that *are* your keeper on Beacon. On your own computer they're its backup; at a door they let you take your keeper home (`watchfire import`). Anyone who sees them can play as you, so only look when nobody's watching.
- **Already playing another Beacon game?** Your account from it can be your keeper: before your first game of Watchfire, run `watchfire import` with its recovery phrase.
- **Pages (at a door).** A page is one line to someone else at the door. It appears on their screen with a beep.
