#!/usr/bin/env bash
# Photograph a page tall, then keep 1140 × 720 of it from y pixels down: crop.sh <url> <y> <out.png>
set -euo pipefail
url=$1; y=$2; out=$(realpath -m "$3")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
here=$(dirname "$(realpath "$0")")
"$here/shoot.sh" "$url" "$work/tall.png" "1140,$((y + 720))" >/dev/null
cat > "$work/crop.html" <<HTML
<!doctype html><style>html,body{margin:0;overflow:hidden}img{display:block;margin-top:-${y}px}</style><img src="tall.png">
HTML
"$here/shoot.sh" "$work/crop.html" "$out" >/dev/null
echo "$out"
