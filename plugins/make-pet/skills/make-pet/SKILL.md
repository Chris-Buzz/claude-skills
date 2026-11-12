---
name: make-pet
description: Make a desktop pet of your own animal or character for Claude Code on Windows or macOS. ChatGPT draws its sprite sheets from your photos; the pet sits on the desktop and shows when Claude is working, needs you, is done, blocked or asleep, with a board of every session.
disable-model-invocation: true
---

# Make a pet

You build the user a desktop pet: a small Tauri app (Rust with a web page) that shows their pet in a transparent,
always-on-top window and changes pose with Claude Code's state. Claude Code reaches it only through command hooks
in `~/.claude/settings.json` that write one small file per session; the hooks print nothing, so the pet adds nothing
to any chat's context. The app is already written: it is in `template/`, and `scripts/new_pet.py` fills in the
pet's name. Your work is the art, the build and the checks, done with the user step by step.

The finished pet matches ChatGPT's desktop pets: drag it anywhere (it runs while dragged), a status pill (Working,
Needs you, Done, Blocked) with ChatGPT's priority across sessions, a right-click menu (sessions, size, start at
login, hide), a tray icon (the menu bar on a Mac), a shortcut to show or hide it, and a still frame when the
system's reduce-motion setting is on. A click opens its board: every Claude session grouped by project,
orchestrator first with workers under it, numbers from each transcript, and a Quick Chat box with a mic (optional,
transcribed on the computer with whisper.cpp).

Where Windows and macOS differ, the step says so. The app has run on Windows 11. On macOS its code type-checks
(with Rust's macOS targets) and follows Tauri's documented setup, but it has not yet run on a Mac; if something
misbehaves there, work through "If something fails on a Mac" at the end, fix it in the project, and tell the user
what changed.

## 1. Check the machine

Check each, and ask before installing anything:

- **Windows 11:** Node 20 or later (`node --version`), Rust with the MSVC toolchain (`cargo --version`; `rustup`
  needs Visual Studio Build Tools with "Desktop development with C++"), Python 3 with Pillow, numpy and scipy
  (`python -c "import PIL, numpy, scipy"`), Git for Windows (Claude Code runs hooks in its bash).
- **macOS:** the Xcode Command Line Tools (`xcode-select -p`; install with `xcode-select --install`), Rust
  (`cargo --version`, from rustup.rs), Node 20 or later, Python 3 (`python3 --version`; its packages go in a
  project virtual environment in step 5).
- **Both:** a way to drive ChatGPT: the `chatgpt-bridge` plugin (preferred: text and file paths, cheap) or Claude
  in Chrome, with the user signed in to ChatGPT. They sign in; you never type a password.

Done when every check passes or the user has chosen to install what was missing.

## 2. Create the project

Ask for the pet's name and a folder (suggest `C:/Projects/<name>-pet` on Windows, `~/Projects/<name>-pet` on a Mac),
then run (`python3` on a Mac):

```
python <skill dir>/scripts/new_pet.py --name "<Name>" --dest "<folder>" --owner "<their name or handle>"
cd "<folder>" && npm install
```

Done when the folder exists, the script printed the app identifier, and `npm install` finished.

## 3. Get photos of the pet

Ask the user for three to five photos and to put them in `art/photos/` in the project (or give you their paths and
copy them there). Ask for: the face from the front, the whole body sitting, the whole body from the side (for the
running strip), and anything that shows markings, in good light and not blurred. A drawn character works the same
way with its pictures.

Open each photo and write a short description of what makes this pet look like itself: colours and pattern, eye
colour, ear shape, muzzle, tail, collar or bell, size. Read it back to the user and correct it with them; it goes
into every ChatGPT prompt alongside the photos, so the sprites keep the real markings.

Done when `art/photos/` holds at least a front face, a sitting body and a side view, and the user has approved the
description.

## 4. Draw the sprite sheets with ChatGPT

Follow [`reference/sprites.md`](reference/sprites.md): a base portrait first, then the seven strips, one prompt
at a time in the user's visible ChatGPT window, each approved by the user before it is saved to `art/source/`.

Done when `art/source/` holds `idle`, `working`, `waiting`, `done`, `droop`, `wave` and `run` (any image type),
each approved by the user.

## 5. Build the atlas and look at it

On Windows run `python tools/build_atlas.py`. On a Mac, Homebrew's Python refuses packages outside a virtual
environment, so:

```
python3 -m venv .venv && .venv/bin/pip install pillow numpy scipy
.venv/bin/python tools/build_atlas.py
```

It keys out the magenta, cuts each strip at the gaps between poses, scales every strip to the idle pose, stands
all frames on one baseline, and writes `public/pet/` and `art/contact-sheet.png`. Show the contact sheet to the user
and read it yourself at full size.

Done when the script runs without an error and the contact sheet shows every frame whole, the same size, on the
orange baseline, with no pink fringe, and the user is happy with it. A frame-count error or a bad strip means
regenerating that strip (step 4), not editing the script, except the `scale` of the `run` strip, which may need
tuning if the side view comes out too big or small.

## 6. Build the app

```
npx tauri icon art/icon.png -o src-tauri/icons
npm test
```

Delete the `android` and `ios` folders `tauri icon` makes. Then build; the first Rust build takes several minutes:

- **Windows:** `npx tauri build --no-bundle`, giving `src-tauri/target/release/<slug>-pet.exe`.
- **macOS:** `npx tauri build --bundles app`, giving `src-tauri/target/release/bundle/macos/<Name>.app`. It has to
  be the `.app`: macOS ties the microphone permission and the no-Dock-icon setting to it.

Done when the 14 tests pass and the exe or `.app` exists.

## 7. Connect it to Claude Code

Run `python <skill dir>/scripts/add_hooks.py --project "<folder>" --dry-run` (`python3` on a Mac) and show the
user the entries. Explain
in plain words: each Claude Code event runs the project's `hook/pet-hook.mjs` with node (named by its full path, so
it works even when the Claude app does not see Homebrew's folders), and the script writes the session's state to
`~/.claude/<slug>-pet/sessions/`; `>/dev/null` throws away anything it prints, so it cannot reach a chat or answer a
permission prompt (that is enforced by the shell redirect, not by asking nicely). Only on the user's yes, run it
again without `--dry-run`; it backs up `settings.json` first. Running it again later replaces these entries, never
doubles them.

Done when `settings.json` still parses, the 8 entries are in it, and after the user starts a new Claude session a
file appears in `~/.claude/<slug>-pet/sessions/`.

## 8. Run it and show it working

Start it: the exe on Windows; `open "src-tauri/target/release/bundle/macos/<Name>.app"` on a Mac, where it has no
Dock icon and lives in the menu bar. Drive each state with a test session, then remove it:

```
echo '{"session_id":"try","cwd":"/tmp"}' | node hook/pet-hook.mjs working
```

(then `needs-you`, `done`, `blocked`, and `end` to remove it). Ask the user to drag the pet, right-click it
(Control-click or a two-finger click on a Mac), press Ctrl+Alt+P twice (Ctrl+Option+P on a Mac), and click it to
open the board.

Done when the user has seen every pose and the board, and the pet follows a real Claude session from Working to
Done. Starting at login is on after the first run (the right-click menu turns it off).

## 9. The mic (optional)

The board's mic records the default microphone and transcribes on the computer with whisper.cpp; nothing leaves
the machine. Ask before each download or install, with names, sources and sizes. Both systems need the English
model:

- `ggml-base.en.bin` (148 MB) from `huggingface.co/ggerganov/whisper.cpp`, SHA-256
  `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002`.

Then the whisper program:

- **Windows:** `whisper-bin-x64.zip` (8.9 MB) from the `ggml-org/whisper.cpp` GitHub release `b5454`, SHA-256
  `6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb`. Keep `whisper-cli.exe`, `whisper.dll` and
  every `ggml*.dll` from its `Release` folder, in `%LOCALAPPDATA%\<app identifier>\whisper\bin\`, with the model in
  `%LOCALAPPDATA%\<app identifier>\whisper\`.
- **macOS:** `brew install whisper-cpp` (needs Homebrew), which provides `whisper-cli`; the model goes in
  `~/Library/Application Support/<app identifier>/whisper/`. The first recording makes macOS ask whether the pet may
  use the microphone.

Check the hashes of what you download. The mic appears the next time the board opens.

Done when a spoken sentence lands in the Quick Chat box. If it says nothing came through the microphone, the
default mic is off or muted; `cargo test list_microphones -- --ignored --nocapture` in `src-tauri` lists the
devices.

## If something fails on a Mac

- **The pet never changes pose:** check that a new Claude session writes a file in `~/.claude/<slug>-pet/sessions/`.
  If not, re-run `add_hooks.py` (node may have moved, for example after an nvm switch) and start a new session.
- **The window has a background instead of being see-through:** that means Tauri older than 2.12.1. Add
  `"macOSPrivateApi": true` under `app` in `src-tauri/tauri.conf.json` and the `macos-private-api` feature to
  `tauri` in `src-tauri/Cargo.toml`, then rebuild.
- **The first click on the pet does nothing:** both windows in `tauri.conf.json` should have
  `"acceptFirstMouse": true`.
- **A Dock icon shows:** the `set_activation_policy` call in `src-tauri/src/lib.rs` setup did not take; rebuild the
  `.app` and start it from the `.app`, not from `target/release`.
- **The mic hears nothing:** System Settings, Privacy and Security, Microphone: turn the pet on. The permission
  belongs to the `.app`.
- **Show Claude or the VS Code button says it is missing:** they open the apps named "Claude" and
  "Visual Studio Code" in `/Applications`.
