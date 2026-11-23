# The beacons.gg listing

Watchfire's page in the [games directory](https://beacons.gg/games): `data.json` (name, line,
description, tags, the games it works with) and `images/` (icon 512 × 512, banner 1500 × 500,
screenshots 1140 × 720, in order by their number). `submit.sh` sends it all; the answer, saved to
`answer.json` and never committed, holds the listing's only edit link. See
[List your game](https://beacons.gg/docs/list-your-game).

```sh
EMAIL=you@example.org listing/submit.sh   # once; afterwards edit through the edit link
```

## Making the images again

Everything is drawn from the real game and website, photographed by a headless Chromium
(`chromium` on the PATH) in JetBrains Mono.

**Game screens.** Play in tmux with colours on and a keeper of its own, then capture each screen:

```sh
export WATCHFIRE_HOME=$(mktemp -d) COLORTERM=truecolor FORCE_COLOR=3
tmux new-session -d -s shot -x 120 -y 40 'pnpm play'   # 80 × 24 for the place picker
tmux capture-pane -t shot -e -p > fire.ansi            # on each screen
node listing/tools/term-shot.mjs fire.ansi fire.html 120 40
listing/tools/shoot.sh fire.html listing/images/1-fire.png
```

A new keeper's first message (where its key is) stays on screen: restart the game before
capturing. Deleting `snapshot` from `$WATCHFIRE_HOME/state.json` brings back the
"while you were away" news.

**Website.** Run it alone against the real servers, then photograph the top and crop the map:

```sh
WATCHFIRE_DOOR_PORT=0 WATCHFIRE_WEB_PORT=8099 WATCHFIRE_DOOR_HOME=$(mktemp -d) pnpm door
listing/tools/shoot.sh http://localhost:8099/ listing/images/6-website.png
listing/tools/crop.sh http://localhost:8099/ 720 listing/images/4-website-map.png
```

Set `WATCHFIRE_JOIN` to a public door's command to show it beside the download button.

**Icon and banner.** Pixel art from the game's flame palette and spread:

```sh
node listing/tools/art.mjs /tmp/art
listing/tools/shoot.sh /tmp/art/icon.html listing/images/icon.png 512,512
listing/tools/shoot.sh /tmp/art/banner.html listing/images/banner.png 1500,500
```

The Windows executable's icon is the same picture, at every size Windows uses:

```sh
node listing/tools/ico.mjs listing/images/icon.png apps/cli/assets/watchfire.ico
```
