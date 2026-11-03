# Setting up /my-design on a machine

Check these once per machine; the preflight in SKILL.md does the cheap ones automatically.

| Need | Check | Fix |
| --- | --- | --- |
| Node 18+ (scripts and the bridge) | `node --version` | install Node LTS |
| The chatgpt-bridge plugin | `chatgpt_status` is among the tools | `/plugin install chatgpt-bridge@chris-buzz`, then restart Claude Code |
| ChatGPT signed in for the bridge | `chatgpt_status` returns `ready` | sign in once in the Chrome window it opens, with **Continue with email** (Google refuses automated windows); the profile lives in `~/.chatgpt-bridge/` on each machine |
| Fallback if the bridge can't sign in | Claude in Chrome extension connected, and ChatGPT signed in in real Chrome | the concept round uses the Chrome recipe in `concepts.md` |
| Google Chrome installed | the bridge and `render-board.mjs` launch `channel: 'chrome'` | install Chrome |
| Board renderer | `node <skill folder>/scripts/render-board.mjs` prints its usage line | run `npm install` once in `<skill folder>/scripts` (it installs playwright-core, which drives your installed Chrome) |
| Review skills (optional) | a design-review skill, an anti-slop skill and an accessibility skill are installed | install the ones you like; the review step names what it used and skips what is missing |
| claude.ai Design and Design System artifact types | Artifact `list` with `scope: "types"` shows both | they are account-level; without them, build the system and board as plain HTML pages instead and say so |
| Project design folder | `<project>/design/links.json` | commit `design/` with the project, or the next machine starts a second canvas |

Restart Claude Code after installing a plugin so its tools load.

The first ChatGPT run on a new machine needs someone at the screen to sign in. Every run after that
reuses the profile.
