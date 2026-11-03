# Concept round: ChatGPT draws, you pick

ChatGPT's image generation makes quick concept mocks, so the user can judge a direction from a
picture instead of a paragraph. It runs through the `chatgpt-bridge` plugin's MCP server, which
drives the user's own signed-in ChatGPT in a visible Chrome window. Read the chatgpt-bridge skill
once per session: its ground rules apply here.

## Why the bridge and not another browser

- It returns text and file paths, not page snapshots: about 300-1,000 tokens per prompt. Driving
  a browser extension costs roughly 5-10k tokens per concept in clicks, screenshots and polling, and
  a generic Playwright MCP costs tens of thousands per page snapshot.
- It saves full-size images straight to disk. A browser extension usually cannot write files, so
  each image would be a download that needs approval.
- It runs in its own Chrome profile, not the user's everyday browser with all their signed-in
  accounts. The sign-in survives across sessions, and the bridge stops at a sign-in or bot check
  instead of working around it.

**Signing the bridge in.** Google refuses its sign-in inside any automation-controlled browser
("This browser or app may not be secure"), so "Continue with Google" fails in the bridge's window.
Sign in with **Continue with email** (password or emailed code) instead. Never patch the bridge to
hide automation from Google: that is bot-detection evasion. If the account is Google-only, use the
fallback below.

**Fallback: Claude in Chrome.** Use it when the bridge can't run or can't sign in, and the user
agrees. Their real Chrome is usually already signed in to ChatGPT. Read the Claude in Chrome skill
first, then work in one new tab on chatgpt.com only, and never touch the user's other tabs or
accounts. About 5-8k tokens per concept:

1. `tabs_context_mcp` with `createIfEmpty`, then navigate the new tab to `https://chatgpt.com/` (a new
   chat per concept, so styles don't bleed between directions).
2. Send with one `javascript_tool` call: focus `div.ProseMirror[contenteditable="true"]`,
   `document.execCommand('insertText', false, prompt)`, then click `button[aria-label="Send"]`.
   Start the prompt with "Create an image." and end it with "Landscape image, 3:2."
3. Poll with `javascript_tool` loops **under 40 seconds each** (the call times out at 45): done when
   `button[aria-label="Stop"]` is gone and the conversation region (`[aria-label="Conversation"]`)
   holds an `img` with a natural width of at least 1000. ChatGPT sometimes draws two variants; wait
   for Stop to clear.
4. Capture without downloading: find the image's centre with `getBoundingClientRect`, `left_click` it
   for real (a scripted `.click()` doesn't open the viewer), `hover` the cursor into a corner, read
   the viewer image's rect, then `computer` `zoom` that region with `save_to_disk: true`. You get a
   1080 px PNG path; copy it to `design/concepts/<letter>-<slug>.png`. No download approval needed.
5. If the user wants full-size files instead, ask once for the downloads (file names, chatgpt.com,
   about 1-3 MB each).
6. Close your tab when the round is done.

The tab can jump to another chat when the user uses ChatGPT elsewhere at the same time. Check the URL
before each capture and navigate back if needed.

**When ChatGPT changes its markup**, the bridge's `selectors.mjs` is the one file to fix. At the time
of writing: one `[data-turn-key]` block per exchange holding both the user's bubble
(`[data-user-message-bubble="true"]`) and the reply, `[data-talvt-turn-state]` of `in_progress` or
`complete`, Send and Stop found by `aria-label`, and the composer as `div.ProseMirror`.

## Rules (from the bridge, and they hold here)

- **The user signs in; you never do.** If `chatgpt_status` says `needs_user`, say what the window
  needs, keep working on everything that doesn't need it, and call `chatgpt_status` again later.
- **Small and watched.** Send one request at a time while the user is in the session. A round is
  four concepts, and there are at most two rounds per project. No loops, no unattended runs.
- **Nothing sensitive in a prompt.** No keys, client data, private code, or confidential or regulated
  material. For a client site, describe the business only from public facts.
- **Saving needs a yes.** Ask once at the start of the round: "I'll save each concept to
  `<project>/design/concepts/`. OK?" That yes covers the round. `chatgpt_save_image` only reaches
  the newest turn that has images, so save each concept right after it is drawn, before sending the
  next prompt.

## The four directions

Each concept is a different answer to the open questions in the draft design system. Every concept
keeps the fixed base (the psychology rules, the taste rules) and varies along the draft's open axes,
such as ground (light or dark), the medium of the theme, accent, type voice and density. Make them
genuinely different. Two concepts that differ only in accent colour waste a slot.

Name them with a letter and two words ("A · Vignelli Day"). The user picks by letter.

## The prompt

One paragraph, in this order. Use exact hex values and exact copy, because ChatGPT renders text
better when it is told the words.

```
High-fidelity UI design concept for <App>, <one-line what it is>, for <audience>. Show <three>
<iPhone screens | desktop pages> side by side, flat and front-on on a plain <#F2F2F2> background,
no hands, no devices at an angle, no reflections. Screen 1: <flagship screen and its real content>.
Screen 2: <second key screen>. Screen 3: <a moment: the receipt, an empty state, the done state>.
Direction "<A · Name>": <ground hex>, <ink hex>, one accent <hex> used only for <what>. Type:
<Geist-like clean grotesque for UI, monospace for numbers and labels, uppercase mono microcaps>.
<The theme devices, described as information design: e.g. departures as rows with a countdown in
minutes, projects as coloured lines with lettered circular bullets, roadmap steps as stations on a
line>. Use this exact text: "<label 1>", "<label 2>", "<times>". Crisp, product-grade, Linear-level
polish. Avoid: gradients, glow, glassmorphism, emoji, stock illustrations, lorem ipsum.
```

Call `chatgpt_send` with `chat: "<project>-concepts"` and `max_wait_s: 240`. If it returns
`pending`, call `chatgpt_wait`. Then `chatgpt_view` once, at 768 px, to check that it drew what was
asked. If the image is unusable (garbled layout, ignored the direction), send one corrective
follow-up in the same chat, then move on. Then save it as `<letter>-<slug>`.

Record each prompt and result in `design/concepts/prompts.md`, with the letter, the prompt, the
file name and a one-line note on what came out. A later session or machine can then redo a round.

## Showing them to the user

1. `SendUserFile` with all four images (`display: "render"`), captioned with the letters and names.
2. One `AskUserQuestion`, multiSelect, with four options: one per concept, each with a one-line
   description of what is distinctive about it. The user can pick several and use "Other" to mix
   ("A's board with C's colours").
3. Ask what to take from each pick if the answer doesn't say. Write the picks and the user's words,
   verbatim, to `design/concepts/picks.md`. They are the strongest input to the final system.
4. If no concept lands, run a second round that pushes the parts the user did react to. After two
   rounds, stop drawing and work from their words.
5. **The user may redirect mid-round**, for example by sending a reference image. Concepts already
   drawn stay. Steer the remaining prompts toward the reference, write the reference down verbatim in
   `brief.md`, and take its spirit, not a third party's exact marks or palette.
6. When the user picks more than one, ask one question about how they merge (for example "B dark +
   D light": one system, two themes) before deriving tokens.

## When it breaks

- Sends but never finishes, or comes back empty: `chatgpt_debug`, compare with `selectors.mjs`, fix
  the selector, and say what changed.
- An image needs a policy-safe rewrite, such as a real brand's logo: describe the logo instead of
  naming it. Never ask ChatGPT to imitate a living designer's or company's proprietary work.
- The bridge isn't installed: see `setup.md`. Without the bridge, do the concept round as four quick
  HTML artboards in the Design canvas, and say so.
