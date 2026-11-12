# make-pet

`/make-pet` builds a desktop pet of your own animal or character for Claude Code on Windows or macOS. Claude asks for three
to five photos of your pet, describes its markings with you, then has ChatGPT's image generation draw a base sprite
and seven animation strips from them (through the `chatgpt-bridge` plugin or Claude in Chrome, one image at a time,
each approved by you). A small Tauri app then puts the pet on your desktop:

- It sits in a transparent window above everything else, and runs when you drag it.
- Its pose and a small pill follow Claude Code: Working, Needs you, Done, Blocked, then asleep after 20 quiet
  minutes. With several sessions it shows the most urgent.
- Click it for a board of every Claude session, grouped by project (an orchestrator with its workers under it), with
  each session's last exchange and numbers, and a Quick Chat box with an optional local mic.
- Right-click for sessions, size, start at login and hide; Ctrl+Alt+P (Ctrl+Option+P on a Mac) shows or hides it.
  On a Mac it has no Dock icon and lives in the menu bar.

## Install

In Claude Code 2.1.275 or later, one line:

```
/plugin install make-pet --marketplace Chris-Buzz/claude-skills
```

Or in two steps, on any version with plugins:

```
/plugin marketplace add Chris-Buzz/claude-skills
/plugin install make-pet@chris-buzz
```

Then type `/make-pet`. The `chatgpt-bridge` plugin from the same marketplace is the cheapest way for it to drive
ChatGPT; Claude in Chrome works too.

## What it costs your Claude

The skill is user-invoked: it adds nothing to a session's context until you type `/make-pet`. The pet itself is
driven by 8 command hooks in `~/.claude/settings.json` that write one small file per session and print nothing (their
output goes to `/dev/null`), so it adds no tokens to any chat. Each hook run starts Node once, about a tenth of a
second; the one that fires on every step runs in the background.

## Needs

- **Windows 11:** Node 20+, Rust (with Visual Studio Build Tools), Python 3 with Pillow, numpy and scipy, Git for
  Windows.
- **macOS:** the Xcode Command Line Tools, Node 20+, Rust, Python 3 (its packages go in a project virtual
  environment). The app has run on Windows; on macOS its code compiles for both Apple silicon and Intel Macs and
  follows Tauri's documented setup, but it has not been run on a Mac yet, so the skill carries a short list of what
  to check if something misbehaves.
- **Both:** a ChatGPT account. The optional mic downloads an English model (148 MB) and, on Windows, whisper.cpp
  (9 MB) or, on a Mac, `brew install whisper-cpp`, each with your yes.

## Files

- `skills/make-pet/SKILL.md`: the steps Claude follows.
- `skills/make-pet/reference/sprites.md`: the ChatGPT prompts and checks for the seven sprite strips.
- `skills/make-pet/template/`: the app, with the pet's name as placeholders.
- `skills/make-pet/scripts/new_pet.py`: creates your project from the template.
- `skills/make-pet/scripts/add_hooks.py`: shows, then adds, the hook entries (backing up `settings.json` first).
