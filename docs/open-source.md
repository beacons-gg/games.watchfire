# Opening the source

Watchfire's repository is private for now, so its releases (the downloads most players use) and the game's check for a newer version only work for people with access. This is what's ready for the day it opens, what to decide first, and the steps.

## Ready

- **Licence.** Apache-2.0 (`LICENSE`), with a `NOTICE` that every download carries, beside `THIRD-PARTY-NOTICES.txt` for everything bundled into it.
- **For people who come by.** [CONTRIBUTING.md](../CONTRIBUTING.md), [SECURITY.md](../SECURITY.md) (private reports through GitHub), and a bug form (`.github/ISSUE_TEMPLATE`) that asks how they play and warns them off pasting their twelve words.
- **Links that start working.** The game's update check, the website's Download button and the docs all point at this repository's latest release (core's `RELEASES_REPO` and `DOWNLOAD_URL`). Nothing changes on the day: once the releases are public, they work.
- **CI.** Every pull request is typechecked, tested and bundled. The workflows pin their actions by commit and only the release job can write.
- **Checked** (2026-11-23): no secrets, tokens, keys or personal paths in the files or the history.

## Decide first

- **The commit history.** Opening the repository publishes every commit, and with them:
  - **The author email on every commit,** a work address. To keep it private, either rewrite the authors to the GitHub "noreply" address (`git filter-repo --mailmap`, then force-push: every commit and tag gets a new hash), or open a fresh repository from one commit of the current files. Either way, set this repository's `git config user.email` to the noreply address from then on.
  - **Two internal names in early commits:** the private package registry Beacon's SDK came from before it was on npm (`registry.example.com`) and a container registry image (`registry.example.com/beacon-server`). Names only, no credentials; a fresh history drops them too.
  - **A fresh repository** starts its releases over: publish the latest version again there, and keep `RELEASES_REPO` pointing at wherever the releases live.
- **The copyright holder.** `NOTICE` and the Windows executable's details say NorthCtrl (`scripts/package-cli.sh`).

## On the day

1. **Visibility:** Settings → General → Danger Zone → Change visibility → Public.
2. **Security:** Settings → Code security: turn on private vulnerability reporting (SECURITY.md sends people there), secret scanning with push protection, and Dependabot alerts.
3. **Main stays green:** a branch rule on `main` that requires the CI check.
4. **The front page:** the description, the topics (`door-game`, `bbs`, `terminal`, `ssh`, `beacon`), and the website once it has a home (see the [roadmap](roadmap.md)).
5. **Downloads, logged out:** open the latest release in a private window and download one. Run an older version: its main screen should say the new one is out (the check looks once a day; delete `update-check.json` in the Watchfire folder to see it at once).
6. **The listing:** add the download link to the beacons.gg listing through its edit link (see [listing/README.md](../listing/README.md)).
