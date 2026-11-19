# How to play Watchfire

> Somewhere in the world, a fire is about to go out. You have three logs today.

Watchfire is a game you play for about a minute a day, in a terminal window, like the "door games" people played on dial-up bulletin boards in the 1990s. Fires burn at real places around the world. Every day you get three logs to keep them alive. Fires that nobody tends go dark.

The website (the door's address, port 8080) shows the same world live: the map of fires, the ones closest to going out, and the watch log. It also has these instructions.

## Coming in

You visit the game over **ssh**, a standard way to reach another computer. Nothing to install on a Mac, Linux or Windows 10/11.

1. **Open a terminal.** Mac: Spotlight, type *Terminal*. Windows: the Windows key, type *PowerShell*. Phone or tablet: install an ssh app such as **Termius**.
2. **The first time only, make a key:** `ssh-keygen -t ed25519`, then press Enter at each question. (In Termius: Keychain → Keys → Generate.)
3. **Come in:** `ssh -p 2222 <the door's address>`, as the website shows it. The first time, ssh asks whether to trust the door: type `yes`.

**Your key is your keeper.** The door knows you by your ssh key: come back from the same computer and you're the same keeper. A different device (with a different key) is a different keeper. Without any key you come in as a **guest**: you can look at everything, but not lay logs.

Make the window big: the game needs at least 80 × 24 and uses whatever you give it. On a phone, turn it sideways.

## Your first visit

The game asks **where you keep watch**: type a town or city and pick it from the list. That's your home on the map: the main screen shows the fires nearest it. (It's only for the map. You can light and feed fires anywhere.)

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
| **Ashes** | When a fire goes dark, its keepers can **rake** their logs back from the ashes (**R**) for two days: a record of the fires they saw to the end. |
| **Warm your hands** | Anyone, keeper or not, can warm their hands at a fire once (**W** at the fire). It's free, and the fire shows how many have stopped by. |

**Working together.** One keeper's three logs a day add 12 hours, but a day is 24 hours: alone you can carry a fire into tomorrow, not forever. **Two keepers** keep pace with the clock. Pick fires other people are keeping, and tell them with a page.

**Nobody can cheat the fires.** The rules live inside each fire, on the Beacon server that holds it, and the server enforces them for everyone: no one can overfill a fire, take two embers, or feed a fire that's dark.

## Keys

| On the main screen | |
| --- | --- |
| **1**–**9** | Open one of the fires listed |
| **W** | The whole world, closest to going out first |
| **L** | Light a new fire |
| **N** | The watch log |
| **Y** | You: your name, embers and record (**N** there to choose your name, **U** for miles or kilometres) |
| **O** | Who's online at the door; pick someone and **P** to page them a line |
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

- **One seat each.** You can be at the door in one window at a time. Sessions end after five idle minutes, and after an hour.
- **Your name.** You start with a made-up keeper name ("Sleepless Newt"). Choose your own under **Y**ou → **N**: it's your Beacon profile name, so other Beacon games can show it too.
- **Your twelve words.** Under **Y**ou → **K**, the door can show your keeper's recovery phrase: twelve words that *are* your keeper on Beacon. Anyone who sees them can play as you, so only look when nobody's watching.
- **Pages.** A page is one line to someone else at the door. It appears on their screen with a beep.
