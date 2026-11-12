# Claude Code skills by Chris Buzaid

Four plugins I built for Claude Code.

| Plugin | What it does | Needs |
| --- | --- | --- |
| [my-design](plugins/my-design) | Designs a whole app or site: research on the people it is for, a design system drafted with you, four concepts drawn by ChatGPT that you pick from, a board of every page, then design and accessibility reviews. | Claude Code with claude.ai artifacts. The concept step uses the ChatGPT bridge. |
| [council](plugins/council) | A review with three kinds of reviewer: fresh Claude reviewers, Codex and Gemini read the same packet without seeing each other's notes, and every finding is checked against the source before it counts. | The Codex plugin and the Antigravity (Gemini) command-line tool for the outside reviewers. |
| [chatgpt-bridge](plugins/chatgpt-bridge) | Lets Claude Code use your own signed-in ChatGPT in a visible Chrome window, for a second opinion or concept art. It hands back text and file paths instead of whole pages, so a round trip costs a few hundred tokens. | Node.js 18+, Google Chrome, and a ChatGPT account. |
| [make-pet](plugins/make-pet) | Makes a desktop pet of your own animal or character. ChatGPT draws its sprite sheets from your photos; the pet then shows when Claude is working, needs you or is done, and a click opens a board of every session. | Windows 11 or macOS, Node 20+, Rust, Python 3 and a ChatGPT account. Not yet run on a Mac (see its README). |

## Install

In Claude Code:

```
/plugin marketplace add Chris-Buzz/claude-skills
/plugin install my-design@chris-buzz
/plugin install council@chris-buzz
/plugin install chatgpt-bridge@chris-buzz
/plugin install make-pet@chris-buzz
```

Install only the ones you want. Restart Claude Code afterwards so the new skills and the bridge's tools load.

Without the plugin system, download this repository as a ZIP and copy a plugin's `skills/<name>` folder into
`~/.claude/skills/`. The bridge also needs its `server` folder registered as an MCP server (see its README).

## What these touch

- **council** sends the files you choose to OpenAI (Codex) and Google (Gemini). It refuses paths and text that look
  like secrets, and anything matching its `blocked.txt`. Read its README before the first run.
- **chatgpt-bridge** drives a real Chrome window signed in to your ChatGPT account. You sign in yourself, it sends
  one request at a time while you watch, and it never saves a file without your yes. OpenAI's terms limit
  automated use, so keep it small and supervised.
- **my-design** publishes its design system and board as private claude.ai artifacts in your account.
- **make-pet** sends your pet's photos to ChatGPT to draw the sprites, and adds 8 hooks to `~/.claude/settings.json`
  after showing them to you and backing the file up. The hooks write one small file per session and print nothing,
  so they add nothing to a chat. The pet's optional mic records only between your clicks on its button and
  transcribes on your own machine.

## License

MIT. See [LICENSE](LICENSE).
