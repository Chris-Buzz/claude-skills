---
name: my-design
description: "A design workflow for a whole app or site, from nothing to a reviewed board. Researches the psychology of the users, drafts a per-project design system with you, has ChatGPT draw concept mocks you pick from, publishes the system, then builds an interactive claude.ai Design canvas covering every page, reviewed by design and accessibility skills. Use for /my-design, \"design this app\", \"design every screen\", \"make a design system for X\", or a full redesign. For polishing existing code, use a polish or redesign skill instead. Not the built-in /design command."
argument-hint: "[app name or project folder] [system | concepts | board | review]"
---

# /my-design

A way of designing a product: evidence and your eye first, then every page. The order is fixed,
because your taste goes in at the concept pick, before the board is built.

```
1 brief + page inventory --> 2 psychology research --> 3 draft the system together
--> 4 ChatGPT concepts, you pick --> 5 publish the system --> 6 board of every page
--> 7 review by other skills --> 8 report, then iterate
```

Read `reference/taste.md` at the start of every run. The other references load at their phase:
`psychology.md` (2), `design-system.md` (3, 5), `concepts.md` (4), `pages.md` (1, 6), `board.md` (6),
`review.md` (7), `setup.md` (preflight failures). Paths are relative to this skill's folder (the base
directory shown when the skill loads).

## Where the work lives

Everything for one project sits in `<project>/design/`, where `<project>` is the folder the user named or
the working directory:

| File | Written in phase |
| --- | --- |
| `brief.md` (product facts, audience, psychology rules, draft decisions) | 1-3 |
| `pages.json` (the inventory; see `pages.md`) | 1, final in 6 |
| `concepts/` (images, `prompts.md`, `picks.md`) | 4 |
| `build/` (the generator: `tokens.mjs`, `ui.mjs`, `system.mjs`, `board.mjs`) | 5, 6 |
| `system/` (the design system's source: `project/tokens.json`, README, components; `pairs.json`) | 5 |
| `board/` (the canvas source: `project/canvas.json`, artboards; `assets.json`) | 6 |
| `review.md` (findings and what happened to each) | 7 |
| `links.json` (`{"system": "<url>", "board": "<url>"}`) | 5, 6 |

The skill's own tools, all Node:

- `scripts/contrast.mjs <tokens.json> <pairs.json>`: WCAG contrast for every pair in every theme.
- `scripts/coverage.mjs <pages.json> <canvas.json>`: every page has an artboard, and the checklist
  is answered.
- `scripts/render-board.mjs <board-root> <out-dir> [--theme light] [--only <text>]`: a PNG per
  artboard, for review. It needs `playwright-core` once: `npm install` in the `scripts` folder.

**Resume, don't restart.** On every run, look at which of these files exist and pick up at the
first phase that is missing. An argument (`/my-design board`) jumps to that phase if its inputs exist.
The system and the board are claude.ai artifacts, so they open the same on any machine. The local
files travel with the project's repo, but don't commit them unless the user asks.

## Preflight (silent when everything is fine)

1. The chatgpt-bridge tools are available (load them with ToolSearch:
   `select:mcp__chatgpt-bridge__chatgpt_status,mcp__chatgpt-bridge__chatgpt_send,mcp__chatgpt-bridge__chatgpt_wait,mcp__chatgpt-bridge__chatgpt_view,mcp__chatgpt-bridge__chatgpt_save_image,mcp__chatgpt-bridge__chatgpt_debug,mcp__chatgpt-bridge__chatgpt_close`).
   The tool names may carry a plugin prefix; search for `chatgpt_status` if the exact names miss.
   Call `chatgpt_status` early, so a sign-in can happen while you work. If it returns `needs_user`,
   tell the user in one line, including that Google sign-in is refused in that window and **Continue
   with email** works, and carry on with phases 1-3. If the bridge can't be signed in, phase 4 uses
   the Claude in Chrome fallback in `concepts.md`, with the user's OK.
2. `node --version` works (the scripts need it).
3. If anything is missing, show the matching rows of `setup.md` and stop only the phases that
   need it.

Track the phases on the task list, and give a one-line update when each phase lands. Long silent
stretches lose people.

## 1. Brief and page inventory

- Gather the product's truth from the code (routes, screens, tokens), the docs (product.md, PRDs,
  plans: these also say what is cut) and any project notes or memory the user keeps. Ask the user
  only for what none of these answer.
- Write `brief.md`: what the product is in one sentence, who uses it and in what state, the two or
  three core jobs, the theme if the user named one, real brand assets, and constraints.
- Draft `pages.json` with `pages.md`: code, then docs, then the checklist.
- Keep both short. Their job is to make phases 3-6 concrete.

## 2. Psychology research

Start it at the beginning of phase 1, as a background subagent (`model: "sonnet"`, WebSearch),
briefed as `psychology.md` says. While it runs, do the inventory. Cut its findings to the rules
that change a token, a component or a layout, and add them to `brief.md` with their sources.

## 3. Draft the system together

Follow `design-system.md` section 1: a fixed base (psychology rules plus taste rules plus
constraints, each with its reason) and two to four open axes. In the same message, show the page
inventory as a short list grouped by flow, so the user can add pages. Then one `AskUserQuestion`: what
to change in the base, and which four directions ChatGPT should draw. Record the answers verbatim.

## 4. Concepts: ChatGPT draws, you pick

Follow `concepts.md`. Ask once for the save to `design/concepts/`, draw four concepts one at a time
in the visible window, show them with `SendUserFile`, and let the user pick with `AskUserQuestion`
(multiSelect, plus Other for mixes). Write `picks.md` with the user's words. **No board work starts
before the user has picked.** That pick is where their eye enters the design.

## 5. Publish the system

`design-system.md` sections 3-5: derive exact tokens from the picks, write the README and the
signature components, pass `scripts/contrast.mjs`, then publish it as a Design System artifact and
record the URL in `links.json`. Show the link and what was decided.

## 6. The board: every page

`board.md`: a Design canvas with the system installed, a Concepts row first, then one row per flow,
with every page from `pages.json` as an interactive artboard joined by prototype links. Send the
flagship flow first. The board is not done until `scripts/coverage.mjs` exits 0.

## 7. Review by other skills

`review.md`: a design critique and audit, a taste pre-flight and an accessibility pass, each in a
parallel subagent with screenshots and sources, judging execution within the chosen direction. Fix
high and medium findings and record everything in `review.md`. The user's picks and `taste.md`
outrank the reviewers.

## 8. Report and iterate

Report: the board link, the coverage line, what the review changed and what it rejected, and the
open questions. Ask what to change. That starts the next loop: targeted changes stay targeted
(change only what the user named), and a new direction goes back to phase 3.

If the user keeps project notes or a memory, record the system and board URLs and the picked
direction there, so the next session on any machine finds them.

## Standing rules

- **The user's taste over the defaults.** `taste.md` is their eye. A reviewer's rule, a type's
  default palette or a trend never overrides a pick they made.
- **Every page.** No hero-only boards. The inventory is checked by script.
- **Theme as information design.** A theme the user asks for (a transit board, a paper planner)
  shapes how information is organised and shown, not ornament. Don't copy a real operator's marks,
  signage typefaces or proprietary designs; build an original language from the same principles.
- **Real content.** Copy comes from the product's docs and voice rules; unknown facts become
  visible placeholders. No lorem ipsum, invented stats or emoji.
- **Keep context lean.** Research and reviews run in subagents on `sonnet`; this session
  orchestrates. Don't read the large design skills into the main context.
- **The ChatGPT bridge's rules hold:** the user signs in, one request at a time in the visible
  window, nothing sensitive in a prompt, and saves only with their yes.
- **Nothing outward without asking.** The artifacts are private. Sharing them, committing or
  pushing, or deploying anything is the user's call.
