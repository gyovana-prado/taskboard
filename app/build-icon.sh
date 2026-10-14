#!/usr/bin/env bash
# Gera build/icon.png com o Electron e monta build/icon.icns com iconutil (macOS).
set -euo pipefail
cd "$(dirname "$0")"
npx electron tools/make-icon.js
rm -rf build/icon.iconset && mkdir -p build/icon.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s build/icon.png --out build/icon.iconset/icon_${s}x${s}.png >/dev/null
  d=$((s*2)); sips -z $d $d build/icon.png --out build/icon.iconset/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns build/icon.iconset -o build/icon.icns
rm -rf build/icon.iconset
echo "build/icon.icns pronto"
