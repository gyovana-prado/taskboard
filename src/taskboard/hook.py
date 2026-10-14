"""Hook do Claude Code: lê o evento no stdin e atualiza o JSON da sessão.

Só stdlib, pra iniciar rápido. Nunca falha de forma visível: qualquer erro
vira exit 0 silencioso, porque um hook quebrado atrapalha a sessão.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from taskboard.store import load_session, new_session, now, save_session  # noqa: E402


def git_branch(cwd: str | None) -> str | None:
    if not cwd:
        return None
    try:
        r = subprocess.run(
            ["git", "-C", cwd, "branch", "--show-current"],
            capture_output=True, text=True, timeout=2,
        )
        return r.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def get_or_create(payload: dict) -> dict:
    sid = payload["session_id"]
    cwd = payload.get("cwd") or ""
    s = load_session(sid)
    if s is None:
        s = new_session(sid, cwd, git_branch(cwd))
    if cwd and not s.get("cwd"):
        s["cwd"] = cwd
        s["project"] = Path(cwd).name
    return s


def on_session_start(payload: dict) -> None:
    s = get_or_create(payload)
    s["status"] = "open"
    s["branch"] = git_branch(payload.get("cwd")) or s.get("branch")
    save_session(s)


def on_session_end(payload: dict) -> None:
    s = get_or_create(payload)
    s["status"] = "closed"
    s["ended_at"] = now()
    save_session(s)


def on_task_create(payload: dict) -> None:
    s = get_or_create(payload)
    inp = payload.get("tool_input") or {}
    resp = payload.get("tool_response") or {}
    task = resp.get("task") if isinstance(resp, dict) else None
    task_id = str((task or {}).get("id") or len(s["tasks"]) + 1)
    subject = (task or {}).get("subject") or inp.get("subject") or "(sem título)"
    for t in s["tasks"]:
        if t["id"] == task_id:
            t["subject"] = subject
            t["status"] = "pending"
            break
    else:
        s["tasks"].append({
            "id": task_id,
            "subject": subject,
            "status": "pending",
            "created_at": now(),
            "updated_at": now(),
        })
    save_session(s)


def on_task_update(payload: dict) -> None:
    s = get_or_create(payload)
    inp = payload.get("tool_input") or {}
    task_id = str(inp.get("taskId") or "")
    if not task_id:
        return
    for t in s["tasks"]:
        if t["id"] == task_id:
            if inp.get("status"):
                t["status"] = inp["status"]
            if inp.get("subject"):
                t["subject"] = inp["subject"]
            t["updated_at"] = now()
            break
    else:
        # update de uma task que não vimos nascer (ex.: hook instalado no meio da sessão)
        s["tasks"].append({
            "id": task_id,
            "subject": inp.get("subject") or f"task {task_id}",
            "status": inp.get("status") or "pending",
            "created_at": now(),
            "updated_at": now(),
        })
    if inp.get("status") == "deleted":
        s["tasks"] = [t for t in s["tasks"] if t["id"] != task_id]
    save_session(s)


HANDLERS = {
    "SessionStart": on_session_start,
    "SessionEnd": on_session_end,
}
TOOL_HANDLERS = {
    "TaskCreate": on_task_create,
    "TaskUpdate": on_task_update,
}


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        if not payload.get("session_id"):
            return 0
        event = payload.get("hook_event_name")
        if event in HANDLERS:
            HANDLERS[event](payload)
        elif event == "PostToolUse":
            h = TOOL_HANDLERS.get(payload.get("tool_name", ""))
            if h:
                h(payload)
    except Exception:  # noqa: BLE001 - hook nunca deve quebrar a sessão
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
