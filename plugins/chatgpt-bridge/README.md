# chatgpt-bridge

An MCP server and skill that let Claude Code use your own ChatGPT in a visible Chrome window: for a second
opinion, opposing views, or concept art. It hands Claude text and file paths instead of whole web pages, so a
round trip costs a few hundred tokens instead of tens of thousands.

## Install

In Claude Code 2.1.275 or later, one line:

```
/plugin install chatgpt-bridge --marketplace Chris-Buzz/claude-skills
```

Or in two steps, on any version with plugins:

```
/plugin marketplace add Chris-Buzz/claude-skills
/plugin install chatgpt-bridge@chris-buzz
```

## How it works

The server opens Google Chrome with its own profile in `~/.chatgpt-bridge/profile` (separate from your everyday
browser), goes to chatgpt.com, types the prompt, waits for the reply and reads back only the text and the size of
any images. Claude can then look at an image once, downscaled (`chatgpt_view`), or save it full size
(`chatgpt_save_image`) after you agree.

## Rules it keeps

- **You sign in.** The first time, the Chrome window opens on ChatGPT's sign-in page. Use **Continue with email**:
  Google refuses sign-in inside automated browser windows. The sign-in is kept in `~/.chatgpt-bridge/profile`, so
  you do this once per machine. A bot check stops the tool and hands the window back to you.
- **One request at a time, while you watch.** No batches, loops or unattended runs. OpenAI's terms limit
  automated use of ChatGPT, and the risk is to your account, so keep it small and supervised.
- **Nothing is saved without your yes.** Images stay in ChatGPT until you agree to a save.
- **Nothing sensitive in a prompt.** Prompts go to OpenAI.

## Needs

- Node.js 18+ and npm.
- Google Chrome (the server drives your installed Chrome; it downloads no browser).
- A ChatGPT account.

On the first start after install, the server runs `npm install` in its `server` folder (about 30 seconds). If that
fails (no network, a proxy), run `npm install` there yourself and restart Claude Code.

## Settings

| Variable | Default | What it changes |
| --- | --- | --- |
| `CHATGPT_BRIDGE_HOME` | `~/.chatgpt-bridge` | Where the profile and the list of named chats live |
| `CHATGPT_BRIDGE_PROFILE` | `~/.chatgpt-bridge/profile` | The Chrome profile folder alone |
| `CHATGPT_BRIDGE_OUT` | your temp folder `/chatgpt-bridge` | Where saved images go when no folder is given |

## When ChatGPT changes its page

Every page selector lives in `server/selectors.mjs`. If sending stops working, the `chatgpt_debug` tool prints a
short outline of the page, which is enough to repair the selectors.

## Without the plugin system

Copy `skills/chatgpt-bridge` into `~/.claude/skills/`, run `npm install` in `server`, and register the server:

```
claude mcp add chatgpt-bridge --scope user -- node /path/to/server/start.mjs
```
