"""Adds the pet's Claude Code hooks to ~/.claude/settings.json.

    python add_hooks.py --project "C:/Projects/biscuit-pet" --dry-run   # show what would change
    python add_hooks.py --project "C:/Projects/biscuit-pet"             # change it (after a backup)

Each hook runs the project's hook/pet-hook.mjs with the pet's state for that event. Its output
goes to /dev/null, so nothing it prints can reach Claude's context or answer a permission
prompt; `|| true` keeps a failing run silent.

The command names node by its full path. The Claude app on a Mac can run hooks without
Homebrew's folders on its PATH, and a hook that cannot find node would fail silently and
leave the pet frozen. Running this again replaces the pet's own entries (found by the hook
script's path), so it also refreshes that path after node moves; other hooks are untouched.

The file is rewritten as JSON with two-space indents, so its formatting may change; the
original is saved next to it as settings.json.bak-<timestamp> first.
"""

from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

# (event, matcher or None, state passed to the hook, runs in the background)
HOOKS = [
    ("SessionStart", "startup|resume", "hello", False),
    ("UserPromptSubmit", None, "working", False),
    ("PreToolUse", "AskUserQuestion|ExitPlanMode", "needs-you", False),
    ("PermissionRequest", None, "needs-you", False),
    ("PostToolBatch", None, "working", True),
    ("Stop", None, "done", False),
    ("StopFailure", None, "blocked", False),
    ("SessionEnd", None, "end", False),
]


def quoted(path: str) -> str:
    """A path in single quotes, inside which the shell expands nothing ($, backticks, globs).
    A path that itself holds a single quote is refused rather than escaped."""
    if "'" in path:
        raise SystemExit(f"Rename this folder without a single quote in it: {path}")
    return f"'{path}'"


def entries(script: str, node: str) -> list[tuple[str, dict]]:
    out = []
    for event, matcher, state, background in HOOKS:
        hook: dict = {"type": "command", "command": f"{quoted(node)} {quoted(script)} {state} >/dev/null 2>&1 || true"}
        if background:
            hook["async"] = True
        else:
            hook["timeout"] = 5
        group: dict = {"hooks": [hook]}
        if matcher:
            group = {"matcher": matcher, **group}
        out.append((event, group))
    return out


def without_script(groups: list[dict], script: str) -> list[dict]:
    """The event's hook groups minus any hook that runs this pet's script."""
    kept = []
    for group in groups:
        hooks = [h for h in group.get("hooks", []) if script not in h.get("command", "")]
        if hooks:
            kept.append({**group, "hooks": hooks})
    return kept


def main() -> None:
    parser = argparse.ArgumentParser(description="Add the desktop pet's hooks to Claude Code's user settings.")
    parser.add_argument("--project", required=True, help="the pet project folder")
    parser.add_argument("--settings", default=str(Path.home() / ".claude" / "settings.json"), help="settings file to change")
    parser.add_argument("--dry-run", action="store_true", help="print the change without making it")
    args = parser.parse_args()

    project = Path(args.project).expanduser().resolve()
    if not (project / "hook" / "pet-hook.mjs").is_file():
        raise SystemExit(f"No hook/pet-hook.mjs in {project}")
    script = (project / "hook" / "pet-hook.mjs").as_posix()
    found = shutil.which("node")
    node = Path(found).as_posix() if found else "node"
    if not found:
        print("node was not found on this PATH; the hooks will call plain `node`.")

    settings_path = Path(args.settings).expanduser()
    settings = json.loads(settings_path.read_text(encoding="utf-8")) if settings_path.exists() else {}
    before = json.dumps(settings.get("hooks", {}), sort_keys=True)

    hooks = settings.setdefault("hooks", {})
    for event in list(hooks):
        hooks[event] = without_script(hooks[event], script)
        if not hooks[event]:
            del hooks[event]
    for event, group in entries(script, node):
        hooks.setdefault(event, []).append(group)

    if json.dumps(hooks, sort_keys=True) == before:
        print(f"The pet's hooks in {settings_path} are already up to date.")
        return
    for event, group in entries(script, node):
        print(f"{event}: {json.dumps(group)}")
    if args.dry_run:
        print(f"\nDry run: these 8 entries would be written to {settings_path}, replacing any earlier ones for this pet.")
        return

    if settings_path.exists():
        backup = settings_path.with_name(f"{settings_path.name}.bak-{time.strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(settings_path, backup)
        print(f"\nBacked up the old file to {backup}")
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote 8 entries to {settings_path}. They apply to Claude Code sessions started from now on.")


if __name__ == "__main__":
    main()
