# The project's design system, drafted together

Every project gets its own system. Each one draws on `taste.md` (the user's eye), the project's
psychology research (`psychology.md`), and whatever the project already has (code tokens, a client's
real logo and colours, screenshots). It is drafted with the user, mocked up by ChatGPT, chosen by
them, and only then written down.

## 1. The draft (before any image)

Write it in chat, short enough to read in a minute. It has two halves.

**The fixed base:** what follows from evidence and taste and is not up for a vote. For each line,
give the reason in a few words.
- the three to five design rules from the psychology research, each with its source;
- the taste rules that apply (one accent, one card treatment, a mono label voice, radius family,
  no emoji, motion that answers an action);
- constraints: platform sizes, contrast, Dynamic Type, reduced motion, what the product cuts.

**The open axes:** the two to four questions where a picture decides better than an argument.
Typical ones are light or dark ground; the medium of the theme (split-flap or LED for a transit
board, letterpress or screen for an editorial one); accent hue; density; type voice (grotesque
only, or a display face).

Then ask, in one `AskUserQuestion`:
1. "Anything in the fixed base you'd change?" (options: "Base is right", "Loosen a rule",
   "Tighten a rule"; specifics go in Other);
2. "Which directions should ChatGPT draw?" (multiSelect, four options, one per direction, each a
   different point on the open axes).

The answers go in `design/brief.md` under "Draft decisions", verbatim.

## 2. Concepts and picks

Follow `concepts.md`. The picks and the user's words in `design/concepts/picks.md` are the strongest
input. Where a pick conflicts with a taste rule, the pick wins. Note it in the README so a later
session doesn't "fix" it back.

## 3. The final system

Derive exact values from the picked concepts. Don't copy hexes off a JPEG blindly: sample them,
then adjust for contrast and keep the hue. Build:

- **Colour.** Themes: one, or light + dark when the product needs both (put the primary theme
  first). Roughly 10-16 tokens: ground, raised surface, line, ink, ink-2, ink-3 (each passing 4.5:1
  on the ground), the one accent, accent-ink (text on the accent), status colours (ok, late,
  error) that differ in lightness, and any theme set such as category colours. Every token has
  a `usage` note that names the grounds it is allowed on.
- **Type.** Families (for example Geist + Geist Mono, both on Google Fonts) and a semantic scale:
  display, h1, h2, h3, body, body-sm, label (mono microcaps), numeric (mono, tabular). Use 6-9
  styles with px sizes, line heights and weights. Body is at least 15px on phones.
- **Spacing.** A 4px base: 4, 8, 12, 16, 24, 32, 48, 64.
- **Radius.** One family, two or three steps (6/10/14, for example). `rounded-full` only for things
  that are truly round, like bullets and avatars.
- **Shadow.** None or one; surfaces separate by tone and line first.
- **Motion** (README only, because the type has no motion family). Durations (120/200/320ms), one
  easing curve, what moves and why. Every animation answers an action or shows live state; with
  reduced motion, everything becomes a 150ms cross-fade.
- **Components.** The components the page inventory needs, each with a static `preview.html` and a
  README: what it is for, its states, what the consumer provides, and its accessibility notes.
  Build the theme's signature components first (for a transit board: departure row, line bullet,
  station line).
- **README.** The brand book: content fundamentals (voice, copy rules, example lines), visual
  foundations, iconography (Lucide or Phosphor stroke icons, never emoji), the psychology rules
  with sources, the taste rules it follows or deliberately breaks, and what the concepts decided.

**Generate it.** Keep the values in `design/build/tokens.mjs` and the components in
`design/build/ui.mjs`, and let `design/build/system.mjs` write the Design System files: tokens.json
in the type's list shape, README, one `preview.html` and README per component, `components/bundle.css`
(the shared stylesheet, which previews pick up automatically), the cover, and the index. The board
generator reuses the same two modules, so a component looks identical in the system and on the
board. The cover follows the type's `cover.md`: three to five colour blocks from the identity
colours, one pattern, and the name in the display face.

**Inventory before tokens.** If the project has a real logo or tokens in code (a `Logo` component, a
theme file), use them exactly.

## 4. Check before publishing

Write `design/system/pairs.json`, listing every text/background pair the system allows:
`[{"fg": "ink-2", "bg": "ground", "min": 4.5}, {"fg": "accent-ink", "bg": "accent", "min": 4.5}]`.
Generate it from `tokens.mjs`, so a new token can't skip the check. Include the letters on each
category colour (3:1 when they are large and bold), and each category colour against both grounds
(3:1, non-text). Then run:

```
node <skill folder>/scripts/contrast.mjs <project>/design/system/project/tokens.json <project>/design/system/pairs.json
```

It checks each pair in every theme. Fix any failure by moving lightness, not hue, before publishing.

## 5. Publish

1. Keep the source in the project: `<project>/design/system/project/` holds `tokens.json`,
   `README.md`, `components/...` and `design-system.json`, exactly as the Design System type lays
   them out. That copy is what code reads later, and it travels with the project's repo.
2. Publish it as a **Design System artifact**, which is what the Design canvas installs. Create it
   once from the Design System artifact type (find its `type_url` with an Artifact `list`,
   `scope: "types"`; `title` = the app's name, `auto_open: "after_first_write"`), then follow the
   instructions in the create result. Use them, not this file, for the file shapes, since the type
   is versioned and may change. Use `root` = `<project>/design/system`.
3. Record the artifact's URL in `<project>/design/links.json` (`{"system": "<url>", "board": null}`).
4. Tell the user: the link, what it was built from, and what was left out.

When a project already has a system (a `links.json` with a `system` URL), `read` it and revise it as
the type's revising instructions say. Don't make a second one.
