#!/usr/bin/env bash
# Turn the CLI bundle into standalone executables, one archive per platform, for a release. Each
# executable carries its own runtime (Bun's), so players need nothing installed.
#
#   pnpm -C apps/cli run build                  # first: dist/watchfire.mjs and THIRD-PARTY-NOTICES.txt
#   scripts/package-cli.sh 0.1.0 [out-dir]      # BUN=/path/to/bun to pick the bun that builds them
#
# Out: watchfire-<version>-<platform>.tar.gz (.zip for Windows), each a folder with the executable,
# LICENSE and THIRD-PARTY-NOTICES.txt, plus SHA256SUMS.txt. Bun builds every platform from one
# machine. The macOS ones are ad-hoc signed by Bun, not with a Developer ID: see the release notes.
set -euo pipefail

version=${1:?usage: scripts/package-cli.sh <version> [out-dir]}
out=${2:-dist/release}
bun=${BUN:-bun}
src=apps/cli/dist
cd "$(dirname "$0")/.."

[[ -f $src/watchfire.mjs && -f $src/THIRD-PARTY-NOTICES.txt ]] || {
  echo "No CLI bundle in $src: run pnpm -C apps/cli run build first." >&2
  exit 1
}

rm -rf "$out"
mkdir -p "$out"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# platform name in the archive : Bun's target
for pair in linux-x64:linux-x64 linux-arm64:linux-arm64 macos-x64:darwin-x64 macos-arm64:darwin-arm64 windows-x64:windows-x64; do
  platform=${pair%%:*}
  target=${pair#*:}
  name=watchfire-$version-$platform
  mkdir -p "$work/$name"
  exe=watchfire
  [[ $platform == windows-* ]] && exe=watchfire.exe
  # A game shouldn't pick up a .env or bunfig.toml from whatever folder it's run in.
  "$bun" build --compile --target="bun-$target" \
    --no-compile-autoload-dotenv --no-compile-autoload-bunfig \
    "$src/watchfire.mjs" --outfile "$work/$name/$exe" >/dev/null
  cp LICENSE "$src/THIRD-PARTY-NOTICES.txt" "$work/$name/"
  if [[ $platform == windows-* ]]; then
    # python's zipfile rather than zip, which isn't everywhere.
    python3 -I - "$work" "$name" "$out/$name.zip" <<'PY'
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

(cd "$out" && sha256sum -- *.tar.gz *.zip > SHA256SUMS.txt)
echo "$out/SHA256SUMS.txt"
