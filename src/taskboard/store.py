"""Lê o estado direto dos registros do Claude Code, sem hook.

- ~/.claude/sessions/<pid>.json : sessões vivas (pid, sessionId, cwd, name, kind, status)
- ~/.claude/tasks/<sessionId>/N.json : cada task (id, subject, status, blockedBy)
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

CLAUDE_DIR = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude"))
SESSIONS_DIR = CLAUDE_DIR / "sessions"
TASKS_DIR = CLAUDE_DIR / "tasks"
PROJECTS_DIR = CLAUDE_DIR / "projects"

_branch_cache: dict[str, tuple[float, str | None]] = {}
_alive_cache: dict[int, tuple[float, bool]] = {}


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds")


def pid_alive(pid: int) -> bool:
    now = time.time()
    hit = _alive_cache.get(pid)
    if hit and now - hit[0] < 5:
        return hit[1]
    try:
        os.kill(pid, 0)
        r = subprocess.run(["ps", "-p", str(pid), "-o", "comm="], capture_output=True, text=True, timeout=1)
        alive = "claude" in r.stdout.lower()
    except ProcessLookupError:
        alive = False
    except (PermissionError, OSError, subprocess.SubprocessError):
        alive = True
    _alive_cache[pid] = (now, alive)
    return alive


def git_branch(cwd: str | None) -> str | None:
    if not cwd:
        return None
    now = time.time()
    hit = _branch_cache.get(cwd)
    if hit and now - hit[0] < 10:
        return hit[1]
    try:
        r = subprocess.run(["git", "-C", cwd, "branch", "--show-current"],
                           capture_output=True, text=True, timeout=2)
        branch = r.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        branch = None
    _branch_cache[cwd] = (now, branch)
    return branch


def _cwd_from_transcript(session_id: str) -> str | None:
    for p in PROJECTS_DIR.glob(f"*/{session_id}.jsonl"):
        try:
            with p.open() as fh:
                for _ in range(40):
                    line = fh.readline()
                    if not line:
                        break
                    if '"cwd"' in line:
                        cwd = json.loads(line).get("cwd")
                        if cwd:
                            return cwd
        except (OSError, json.JSONDecodeError):
            continue
    return None


def live_sessions() -> dict[str, dict]:
    """sessionId -> metadados, só de processos claude vivos."""
    out: dict[str, dict] = {}
    if not SESSIONS_DIR.exists():
        return out
    for p in SESSIONS_DIR.glob("*.json"):
        try:
            d = json.loads(p.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        sid, pid = d.get("sessionId"), d.get("pid")
        if not sid or not isinstance(pid, int) or not pid_alive(pid):
            continue
        out[sid] = d
    return out


def read_tasks(session_id: str) -> tuple[list[dict], float]:
    d = TASKS_DIR / session_id
    tasks: list[dict] = []
    latest = 0.0
    if not d.is_dir():
        return tasks, latest
    for p in d.glob("*.json"):
        try:
            t = json.loads(p.read_text())
            latest = max(latest, p.stat().st_mtime)
        except (OSError, json.JSONDecodeError):
            continue
        if t.get("status") == "deleted":
            continue
        tasks.append({
            "id": str(t.get("id") or p.stem),
            "subject": t.get("subject") or "(sem título)",
            "status": t.get("status") or "pending",
            "blocked": bool(t.get("blockedBy")),
        })
    tasks.sort(key=lambda t: (not t["id"].isdigit(), int(t["id"]) if t["id"].isdigit() else t["id"]))
    return tasks, latest


def all_sessions(include_dead: bool = False) -> list[dict]:
    live = live_sessions()
    ids = set(live)
    if include_dead and TASKS_DIR.exists():
        ids |= {p.name for p in TASKS_DIR.iterdir() if p.is_dir()}
    out = []
    for sid in ids:
        tasks, latest = read_tasks(sid)
        meta = live.get(sid)
        cwd = (meta or {}).get("cwd") or _cwd_from_transcript(sid)
        name = (meta or {}).get("name")
        if (meta or {}).get("nameSource") == "derived":
            name = None
        out.append({
            "session_id": sid,
            "pid": (meta or {}).get("pid"),
            "cwd": cwd,
            "project": Path(cwd).name if cwd else "?",
            "branch": git_branch(cwd),
            "name": name,
            "kind": (meta or {}).get("kind"),
            "busy": (meta or {}).get("status") == "busy",
            "status": "open" if meta else "closed",
            "updated_at": _iso(latest) if latest else _iso((meta or {}).get("startedAt", 0) / 1000),
            "tasks": tasks,
        })
    return out
