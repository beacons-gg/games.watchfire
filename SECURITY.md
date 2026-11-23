# Security

Please don't report a security problem in a public issue. Report it privately instead: on GitHub, the repository's **Security** tab, then **Report a vulnerability**. We'll answer there, and say when a fix is out.

## What counts

- **The game on your own computer** (`apps/cli`, and the release downloads): anything that leaks a keeper's key or recovery phrase, lets fire names or other players' text take over a terminal, or runs code it shouldn't.
- **A door** (`apps/door`): reaching another player's keeper, getting past the master key that seals recovery phrases, getting around bans or session limits, or taking the door or its website down cheaply.
- **The website** (`apps/dashboard`, served by the door): anything that lets a visitor act, rather than only read.
- **The release builds**: anything that could put something into a download that isn't from this repository.

## What doesn't

- **Beacon itself.** The fires live on Beacon servers, which hold and enforce the rules. A problem in a Beacon server or its SDK goes to [beacons.gg](https://beacons.gg).
- **The rules the client keeps.** Three logs a day is counted by the game, not the server ([docs/beacon-integration.md](docs/beacon-integration.md) says why), so a changed client can lay more. That's known and on purpose.

## For players

Your keeper's twelve words (You, then K) are your keeper. Nobody working on Watchfire will ever ask for them: don't paste them, or the files in your Watchfire folder, into an issue, a report or a chat.
