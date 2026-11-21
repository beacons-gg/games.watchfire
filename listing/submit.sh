#!/usr/bin/env bash
# Submits Watchfire to the beacons.gg games directory (https://beacons.gg/docs/list-your-game).
# Prints the answer, which carries the edit link once: it's saved to answer.json (git-ignored),
# keep it. Set EMAIL to have the edit link and the review's outcome mailed to you.
set -euo pipefail
cd "$(dirname "$0")"
data=$(cat data.json)
if [[ -n "${EMAIL:-}" ]]; then
  data=$(python3 -I -c 'import json,sys; d=json.load(sys.stdin); d["email"]=sys.argv[1]; print(json.dumps(d))' "$EMAIL" <<<"$data")
fi
shots=()
for f in images/[0-9]-*.png; do shots+=(-F "screenshots=@$f;type=image/png"); done
curl -sS -X POST https://beacons.gg/api/v1/games \
  --form-string "data=$data" \
  -F "icon=@images/icon.png;type=image/png" \
  -F "banner=@images/banner.png;type=image/png" \
  "${shots[@]}" | tee answer.json
echo
