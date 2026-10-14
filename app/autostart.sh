#!/usr/bin/env bash
# Liga/desliga abrir o Taskboard no login (LaunchAgent, mesmo esquema do Clauddy conta 2).
#   ./autostart.sh on | off | status
set -euo pipefail
LABEL=dev.gyo.taskboard
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
BIN=/Applications/Taskboard.app/Contents/MacOS/Taskboard
case "${1:-status}" in
  on)
    mkdir -p "$(dirname "$PLIST")"
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$BIN</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>ProcessType</key><string>Interactive</string>
</dict>
</plist>
PL
    launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "autostart ligado ($PLIST)"
    ;;
  off)
    launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "autostart desligado"
    ;;
  status)
    if [ -f "$PLIST" ]; then launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 && echo "ligado e carregado" || echo "plist existe mas não está carregado"; else echo "desligado"; fi
    ;;
  *) echo "uso: $0 on|off|status"; exit 1 ;;
esac
