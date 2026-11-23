#!/usr/bin/env bash
# Turn the CLI bundle into standalone executables, one archive per platform, for a release. Each
# executable carries its own runtime (Bun's), so players need nothing installed.
#
#   pnpm -C apps/cli run build                  # first: dist/watchfire.mjs and THIRD-PARTY-NOTICES.txt
#   scripts/package-cli.sh 0.1.0 [out-dir]      # BUN=/path/to/bun to pick the bun that builds them
#   PLATFORMS="linux-x64 windows-x64" scripts/package-cli.sh 0.1.0   # just these
#
# Out: watchfire-<version>-<platform>.tar.gz (.zip for Windows), each a folder with the executable,
# LICENSE, NOTICE and THIRD-PARTY-NOTICES.txt. Bun builds every platform from one machine, but only gives
# the Windows one its icon and details (name, description, version) when it runs on Windows: the
# release builds that one on a Windows runner. The macOS ones are ad-hoc signed by Bun, not with a
# Developer ID: see the release notes.
set -euo pipefail

version=${1:?usage: scripts/package-cli.sh <version> [out-dir]}
out=${2:-dist/release}
bun=${BUN:-bun}
platforms=${PLATFORMS:-linux-x64 linux-arm64 macos-x64 macos-arm64 windows-x64}
src=apps/cli/dist
# Git Bash on Windows. There python3 may be only the Microsoft Store's stand-in: use python.
on_windows=
python=python3
[[ ${OSTYPE:-} == msys* || ${OSTYPE:-} == cygwin* ]] && on_windows=1 python=python
cd "$(dirname "$0")/.."

[[ -f $src/watchfire.mjs && -f $src/THIRD-PARTY-NOTICES.txt ]] || {
  echo "No CLI bundle in $src: run pnpm -C apps/cli run build first." >&2
  exit 1
}

rm -rf "$out"
mkdir -p "$out"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

for platform in $platforms; do
  case $platform in
    linux-x64 | linux-arm64 | windows-x64) target=$platform ;;
    macos-x64) target=darwin-x64 ;;
    macos-arm64) target=darwin-arm64 ;;
    *) echo "No such platform: $platform" >&2; exit 1 ;;
  esac
  name=watchfire-$version-$platform
  mkdir -p "$work/$name"
  exe=watchfire
  details=()
  if [[ $platform == windows-* ]]; then
    exe=watchfire.exe
    if [[ $on_windows ]]; then
      # What Windows shows for the file: its icon, and Properties → Details. The version there is
      # four numbers (0.2.0-rc.1 is 0.2.0.0).
      details=(
        --windows-icon=apps/cli/assets/watchfire.ico
        --windows-title=Watchfire
        "--windows-description=Watchfire, a BBS-style door game"
        --windows-publisher=NorthCtrl
        "--windows-copyright=Copyright $(date -u +%Y) NorthCtrl. Apache License 2.0."
        "--windows-version=${version%%-*}.0"
      )
    else
      echo "Not on Windows: $name gets no icon or details." >&2
    fi
  fi
  # A game shouldn't pick up a .env or bunfig.toml from whatever folder it's run in.
  "$bun" build --compile --target="bun-$target" \
    --no-compile-autoload-dotenv --no-compile-autoload-bunfig "${details[@]}" \
    "$src/watchfire.mjs" --outfile "$work/$name/$exe" >/dev/null
  cp LICENSE NOTICE "$src/THIRD-PARTY-NOTICES.txt" "$work/$name/"
  if [[ $platform == windows-* ]]; then
    # python's zipfile rather than zip, which isn't everywhere.
    "$python" -I - "$work" "$name" "$out/$name.zip" <<'PY'
import os, sys, zipfile
root, name, dest = sys.argv[1], sys.argv[2], os.path.abspath(sys.argv[3])
with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir(os.path.join(root, name))):
        z.write(os.path.join(root, name, f), f"{name}/{f}")
PY
  else
    tar -czf "$out/$name.tar.gz" -C "$work" "$name"
  fi
  echo "$out/$name"
done
