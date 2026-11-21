#!/usr/bin/env bash
# Photograph a page at the listing's screenshot size: shoot.sh <page.html|url> <out.png> [WxH]
set -euo pipefail
page=$1; out=$2; size=${3:-1140,720}
[[ $page == http* ]] || page="file://$(realpath "$page")"
chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size="$size" --virtual-time-budget=4000 --screenshot="$(realpath -m "$out")" "$page" >/dev/null 2>&1
echo "$out"
