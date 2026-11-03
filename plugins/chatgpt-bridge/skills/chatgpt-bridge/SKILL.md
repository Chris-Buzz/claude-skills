---
name: chatgpt-bridge
description: Use when you want ChatGPT as a sparring partner or image maker - "get inspiration", "bounce this off ChatGPT", "give me opposing ideas", "second opinion on this design", "have ChatGPT draw it", "make a mockup or concept art", "generate an image". Drives the user's own signed-in ChatGPT through the chatgpt-bridge MCP tools (chatgpt_send, chatgpt_view, chatgpt_save_image), which return text and file paths instead of page snapshots.
---

# ChatGPT bridge

`chatgpt-bridge` is a small MCP server, shipped with this plugin, that drives a visible Chrome window
signed in to the user's ChatGPT. It costs a few hundred tokens per exchange; a generic Playwright MCP
costs tens of thousands per page snapshot. Prefer it to a browser for anything ChatGPT.

The tool names may carry a plugin prefix (for example `mcp__plugin_chatgpt-bridge_chatgpt-bridge__chatgpt_send`);
search the tool list for `chatgpt_status` to find them.

## Tools

| Tool | Use |
| --- | --- |
| `chatgpt_status` | Open the window; says `ready`, or `needs_user` (signed out or a bot check). |
| `chatgpt_send` | One prompt, waits for the reply. Returns text plus image sizes. `chat`: `new`, `current`, or a name that is remembered across sessions. `temporary: true` keeps it out of the user's history. |
| `chatgpt_wait` | Continue waiting when `chatgpt_send` returns `pending` (images take 1-3 minutes). |
| `chatgpt_view` | One downscaled JPEG of a generated image, about 1k tokens. Look once, not per attempt. |
| `chatgpt_save_image` | Full-size file to disk. Only after the user agrees to the save; say where it goes first. |
| `chatgpt_debug` | Outline of the page for repairing `selectors.mjs` when ChatGPT changes its markup. |
| `chatgpt_close` | Close the window. The sign-in survives in `~/.chatgpt-bridge/profile`. |

## Ground rules

- **The user signs in; you never do.** On `needs_user`, stop and say what the window needs. Never
  type a password, solve a bot check or work around one. Google sign-in is refused in automated
  windows, so suggest **Continue with email**.
- **One request at a time, in the visible window.** No loops, batches or unattended runs. OpenAI's
  Terms of Use bar automated extraction of Output, and the risk is to the user's account; that is
  why it stays slow, small and watched.
- **Nothing sensitive goes in a prompt.** No keys, client data, private repo code beyond the few
  lines under discussion, and nothing confidential or regulated. Prompts go to OpenAI.
- **Saving needs a yes**, each batch. Looking (`chatgpt_view`) does not.
- **Not a yes-man.** ChatGPT's answer is input, not a ruling. Report it as ChatGPT's, say where
  you agree or disagree and why, and let the user decide.

## Bouncing ideas (designs, inspiration, opposing views)

1. Ask a specific question with the minimum context: goal, constraints, the option on the table.
   Do not say which option you prefer; it will flatter you.
2. For an opposing view, ask for it directly: "Give the three strongest objections to this plan,
   then the best alternative and what it costs." For inspiration: "Ten distinct directions, one
   line each, ranked by how far they are from the obvious."
3. At most **three exchanges per question**, in one named chat (`chat: "<project>-<topic>"`).
   Then stop and report.
4. Report as: what ChatGPT said (short), what you accept and reject, and the open choice. Do not
   paste the whole transcript.

## Images

1. Write the prompt as one paragraph. Use the project's art rules if it has them.
2. `chatgpt_send` (it draws in the same reply). If `pending`, `chatgpt_wait`.
3. `chatgpt_view` once. Show the user with `AskUserQuestion` if there is a choice to make.
4. On their yes, `chatgpt_save_image` to the destination the project says.

## When it breaks

- `needs_user`: relay it, wait for the user, call `chatgpt_status` again.
- Sends but never finishes, or returns empty text: run `chatgpt_debug`, compare with
  `selectors.mjs` in the plugin's `server` folder, fix the selector, and say what changed.
- The tools are missing after install: restart Claude Code. The first start installs the server's
  dependencies (about 30 seconds); if that fails, run `npm install` in the plugin's `server` folder.
