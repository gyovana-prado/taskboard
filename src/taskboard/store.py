"""Estado em disco: um JSON por sessão em ~/.claude/taskboard/sessions/."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(os.environ.get("TASKBOARD_DIR", Path.home() / ".claude" / "taskboard"))
SESSIONS = ROOT / "sessions"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def session_path(session_id: str) -> Path:
    return SESSIONS / f"{session_id}.json"


def load_session(session_id: str) -> dict | None:
    p = session_path(session_id)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def save_session(data: dict) -> None:
    SESSIONS.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = now()
    p = session_path(data["session_id"])
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    os.replace(tmp, p)


def new_session(session_id: str, cwd: str, branch: str | None) -> dict:
    return {
        "session_id": session_id,
        "cwd": cwd,
        "project": Path(cwd).name if cwd else "?",
        "branch": branch,
        "status": "open",
        "started_at": now(),
        "updated_at": now(),
        "tasks": [],
    }


def all_sessions() -> list[dict]:
    if not SESSIONS.exists():
        return []
    out = []
    for p in SESSIONS.glob("*.json"):
        try:
            out.append(json.loads(p.read_text()))
        except (OSError, json.JSONDecodeError):
            continue
    return out
