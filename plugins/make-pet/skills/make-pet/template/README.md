# __PET_NAME__

__PET_NAME__ is a desktop pet for Windows and macOS that shows what Claude Code is doing. It sits in a
transparent, always-on-top window, animates from sprite sheets drawn by ChatGPT, and changes pose when a Claude
session is working, needs you, is done, is blocked, or has gone quiet. Clicking it opens its board: every Claude
session grouped by project, with numbers from its transcript and a Quick Chat box. On a Mac it has no Dock icon and
lives in the menu bar.

## How Claude reaches it

Claude Code runs command hooks listed in `~/.claude/settings.json`. Each one runs `hook/pet-hook.mjs` with a state
(`hello`, `working`, `needs-you`, `done`, `blocked`, `end`). The script reads the hook's event JSON from stdin and
writes `~/.claude/__PET_SLUG__-pet/sessions/<session_id>.json`; the app reads that folder twice a second. Every hook
command ends in `>/dev/null 2>&1 || true`, so nothing it prints reaches Claude's context or answers a permission
prompt.

| Claude Code event | State written |
| --- | --- |
| SessionStart (startup, resume) | hello |
| UserPromptSubmit | working |
| PreToolUse for AskUserQuestion or ExitPlanMode | needs-you |
| PermissionRequest | needs-you |
| PostToolBatch (async, so it never blocks Claude) | working |
| Stop | done |
| StopFailure (API error) | blocked |
| SessionEnd | file removed |

With several sessions the pet shows the most urgent status: needs you, then blocked, done, working. Done and
blocked clear on a click, on the session's next prompt, or after 15 minutes. After 20 quiet minutes it falls asleep.

## Using it

- Drag it anywhere; it runs while dragged and comes back to the same spot next time.
- Click: marks Done and Blocked as seen and opens or closes the board.
- Right-click (Control-click on a Mac): the session list, the board, Mark all seen, Size, start at login, Hide,
  Quit.
- Ctrl+Alt+P (Ctrl+Option+P on a Mac), or the tray or menu-bar icon: show or hide it.
- The board: sessions needing you come first; click one for its last prompt and reply, Show Claude, VS Code, Copy
  id, and its turns, tool calls, tokens, context size, model and branch. Quick Chat opens Claude Code in a terminal
  in the chosen folder with your text filled in; nothing is sent until you press Enter there.

## Building

```
npm install
python tools/build_atlas.py               # art/source strips -> public/pet and art/contact-sheet.png
npx tauri icon art/icon.png -o src-tauri/icons
npm test
npx tauri build --no-bundle               # Windows: src-tauri/target/release/__PET_SLUG__-pet.exe
npx tauri build --bundles app             # macOS: src-tauri/target/release/bundle/macos/__PET_NAME__.app
```

On a Mac, run the Python step inside a virtual environment (`python3 -m venv .venv`, then
`.venv/bin/pip install pillow numpy scipy` and `.venv/bin/python tools/build_atlas.py`). Starting at login points
at the exe or `.app` that was running, so rebuild in place rather than moving it. `PET_SLEEP_MINUTES=1` makes it
fall asleep after a minute, for checking the pose. `npx vite` and `http://localhost:1420/tools/board-preview.html`
show the board with made-up sessions.

## The mic

The mic in Quick Chat records the default microphone and transcribes on this computer with whisper.cpp; nothing is
sent anywhere. It needs `ggml-base.en.bin` in the app's data folder under `whisper/`
(`%LOCALAPPDATA%\__PET_ID__\whisper\` on Windows, `~/Library/Application Support/__PET_ID__/whisper/` on a Mac) and
whisper's `whisper-cli` program: in `whisper\bin\` on Windows, or from `brew install whisper-cpp` on a Mac. Without
them the mic stays hidden. `PET_KEEP_CLIP=1` keeps the last clip for checking. On a Mac the first recording asks
for microphone permission, which belongs to the `.app`.
