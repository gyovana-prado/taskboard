#!/usr/bin/env bash
# Reconstrói o Taskboard.app e troca a cópia em /Applications.
set -euo pipefail
cd "$(dirname "$0")"
npm install --no-fund --no-audit
npx electron-builder --mac dir
pkill -f "Taskboard.app/Contents/MacOS/Taskboard" || true
rm -rf /Applications/Taskboard.app
cp -R dist/mac-arm64/Taskboard.app /Applications/
open -a /Applications/Taskboard.app
echo "Taskboard.app instalado e aberto."
