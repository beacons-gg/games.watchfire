# Opening the source

Watchfire's repository is private for now, so its releases (the downloads most players use) and the game's check for a newer version only work for people with access. This is what's ready for the day it opens, what's been done, and the steps.

## Ready

- **Licence.** Apache-2.0 (`LICENSE`), with a `NOTICE` that every download carries, beside `THIRD-PARTY-NOTICES.txt` for everything bundled into it.
- **For people who come by.** [CONTRIBUTING.md](../CONTRIBUTING.md), [SECURITY.md](../SECURITY.md) (private reports through GitHub), and a bug form (`.github/ISSUE_TEMPLATE`) that asks how they play and warns them off pasting their twelve words.
- **Links that start working.** The game's update check, the website's Download button and the docs all point at this repository's latest release (core's `RELEASES_REPO` and `DOWNLOAD_URL`). Nothing changes on the day: once the releases are public, they work.
- **CI.** Every pull request is typechecked, tested and bundled. The workflows pin their actions by commit and only the release job can write.
- **Checked** (2026-11-23): no secrets, tokens, keys or personal paths in the files or the history.

## Done

- **A clean history** (2026-11-23). The code moved from the private `beacons-gg/watchfire` (archived, kept as the internal record) to `beacons-gg/games.watchfire`, following the org's naming (`beacon.core`, `beacon.server`; the demo games as `games.*`). On the way, `git filter-repo` rewrote every commit's and tag's author to the maintainer's GitHub noreply address and replaced the two internal host names in early commits (a private package registry and a container registry) with `registry.example.com`. The files at the tip are the same; the commit hashes are new. This repository's git config uses the noreply address from here on.
- **Releases start over here,** from 0.0.5. The old tags (v0.0.1 to v0.0.4) came across, without their releases.
- **The copyright holder** is NorthCtrl (`NOTICE`, and the Windows executable's details in `scripts/package-cli.sh`).

## On the day

1. **Visibility:** Settings → General → Danger Zone → Change visibility → Public.
2. **Security:** Settings → Code security: turn on private vulnerability reporting (SECURITY.md sends people there), secret scanning with push protection, and Dependabot alerts.
3. **Main stays green:** a branch rule on `main` that requires the CI check.
4. **The front page:** the website, once it has a home (see the [roadmap](roadmap.md)). The description and topics are set.
5. **Downloads, logged out:** open the latest release in a private window and download one. Run an older version: its main screen should say the new one is out (the check looks once a day; delete `update-check.json` in the Watchfire folder to see it at once).
6. **The listing:** add the download link to the beacons.gg listing through its edit link (see [listing/README.md](../listing/README.md)).
