#!/usr/bin/env bash
# Reconstrói o Taskboard.app e troca a cópia em /Applications.
set -euo pipefail
cd "$(dirname "$0")"
npm install --no-fund --no-audit
npx electron-builder --mac dir
# Assinatura ad-hoc: sem Developer ID no keychain, é o que dá pra fazer localmente.
codesign --force --deep --sign - dist/mac-arm64/Taskboard.app
codesign --verify --deep --strict dist/mac-arm64/Taskboard.app && echo "assinatura ad-hoc ok"
pkill -f "Taskboard.app/Contents/MacOS/Taskboard" || true
rm -rf /Applications/Taskboard.app
cp -R dist/mac-arm64/Taskboard.app /Applications/
open -a /Applications/Taskboard.app
echo "Taskboard.app instalado e aberto."
