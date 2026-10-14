"""Painel: lista as sessões abertas do Claude Code e as tasks de cada uma."""

from __future__ import annotations

import argparse
import time
from datetime import datetime, timezone

from rich.console import Console, Group
from rich.live import Live
from rich.panel import Panel
from rich.text import Text

from taskboard.store import all_sessions

STATUS_ICON = {
    "pending": ("○", "white"),
    "in_progress": ("◐", "bold yellow"),
    "completed": ("●", "dim green"),
}


def _age(iso: str) -> str:
    try:
        dt = datetime.fromisoformat(iso)
    except ValueError:
        return ""
    secs = (datetime.now(timezone.utc) - dt).total_seconds()
    if secs < 60:
        return "agora"
    if secs < 3600:
        return f"{int(secs // 60)}min"
    if secs < 86400:
        return f"{int(secs // 3600)}h"
    return f"{int(secs // 86400)}d"


def render_session(s: dict) -> Panel:
    title = Text()
    if s.get("busy"):
        title.append("● ", style="bold yellow")
    title.append(s.get("project") or "?", style="bold cyan")
    if s.get("branch"):
        title.append(f"  ({s['branch']})", style="dim")
    if s.get("kind") == "bg":
        title.append("  bg", style="dim magenta")
    if s.get("name"):
        title.append(f"  {s['name']}", style="dim italic")
    title.append(f"  ·  {_age(s.get('updated_at', ''))}", style="dim")
    if s.get("status") == "closed":
        title.append("  ·  encerrada", style="dim red")

    lines = []
    done = sum(1 for t in s["tasks"] if t["status"] == "completed")
    for t in s["tasks"]:
        icon, style = STATUS_ICON.get(t["status"], ("?", "white"))
        line = Text()
        line.append(f" {icon} {t['id']}. ", style=style)
        if t["status"] == "completed":
            line.append(t["subject"], style="dim strike")
        elif t["status"] == "in_progress":
            line.append(t["subject"], style="bold yellow")
        else:
            line.append(t["subject"])
        lines.append(line)
    if not lines:
        lines.append(Text(" (sem tasks)", style="dim"))
    subtitle = f"{done}/{len(s['tasks'])}" if s["tasks"] else ""
    return Panel(Group(*lines), title=title, title_align="left",
                 subtitle=subtitle, subtitle_align="right", border_style="dim")


def render(show_all: bool) -> Group:
    sessions = all_sessions(include_dead=show_all)
    visible = [s for s in sessions if s["tasks"]]
    visible.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
    idle = sum(1 for s in sessions if s.get("status") == "open" and not s["tasks"])
    parts: list = [render_session(s) for s in visible]
    if not parts:
        parts.append(Text("Nenhuma sessão com tasks. Peça ao Claude pra registrar os próximos passos.",
                          style="dim"))
    footer = Text(f"{len(visible)} sessão(ões) com tasks · {idle} aberta(s) sem tasks · "
                  f"{datetime.now().strftime('%H:%M:%S')}", style="dim")
    parts.append(footer)
    return Group(*parts)


def main() -> None:
    ap = argparse.ArgumentParser(description="Painel de tasks das sessões do Claude Code")
    ap.add_argument("--all", action="store_true", help="inclui sessões já encerradas que deixaram tasks")
    ap.add_argument("--once", action="store_true", help="renderiza uma vez e sai")
    ap.add_argument("--interval", type=float, default=1.0, help="segundos entre atualizações")
    args = ap.parse_args()

    console = Console()
    if args.once:
        console.print(render(args.all))
        return
    with Live(render(args.all), console=console, screen=True, refresh_per_second=4) as live:
        try:
            while True:
                time.sleep(args.interval)
                live.update(render(args.all))
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
