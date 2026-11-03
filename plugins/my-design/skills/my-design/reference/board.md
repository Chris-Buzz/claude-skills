# The board: every page, interactive, on a Design canvas

The board is a claude.ai **Design** canvas: live HTML artboards on an infinite canvas, with the
project's design system installed. It lives on claude.ai, so it opens the same on any machine. Its
source is kept in `<project>/design/board/` too.

The Design type's own instructions (in the create result, plus `artifact-type/reference/format.md`
and `craft.md` on the canvas) govern file shapes, the install step and the calls. Read them each
time, because the type is versioned. This file adds what /my-design does on top, and where it
deliberately differs.

## Build it with a generator, not by hand

For anything over about ten artboards, write a small Node generator in `<project>/design/build/`.
One component source for every screen is what makes a board read as one product. The type's
instructions say to write each file by hand; /my-design overrides that on purpose. Four modules:

- `tokens.mjs`: the token values, themes, type scale, and `themeCss()` (CSS variables for both
  themes, scoped to a root class).
- `ui.mjs`: one stylesheet (`CSS`) and markup helpers for the signature components (bullet, row,
  card, line, tab bar, icons). The design system's `components/bundle.css` is this same string.
- `system.mjs`: writes the Design System files (tokens.json, README, previews, cover, index).
- `board.mjs`: writes every artboard plus `canvas.json` from `pages.json`.

Rules that held up in practice:
- **Each artboard's `<helmet>`** carries the Google Fonts `<link>` and one `<style>`: the theme
  variables plus the shared stylesheet. Replace any `}}` or `{{` in that CSS with `} }` or `{ {`,
  because the runtime reads double braces as holes.
- **A `theme` tweak** (enum dark/light) on every app artboard sets `data-theme="{{theme}}"` on the
  root, so one artboard shows both themes. Add a small "Light theme" row of static copies, so both
  themes are visible on the canvas at a glance (list them in `pages.json` `extras`).
- **Links use canvas-root paths** (`href="/iphone/Inbox.dc.html"`), so a shared tab bar works from
  any folder. An artboard's own path is relative, which breaks shared components.
- **Phones are fixed** 390x844 (taller, such as 390x1180, for long settings pages). **Web pages are
  PAGEs** (`expand: "fill"`, w 1280, h at that width, fluid root). Each web page's phone version is
  its own artboard in a "Website on a phone" row.
- **Rows by flow**, with a `title1` note 260px above each row, and canvas `pages` (one per surface:
  "iPhone app", "Website", "Concepts") once there are more than about 25 artboards.
- **Copy is real.** Take it from the product docs and the existing site, but check it against the
  current scope first. Old marketing copy may describe cut features (a site that still says "Sign
  in" after the app went local-first). Unknown facts become visible placeholders such as
  `[SUPPORT EMAIL]`.
- **Real brand assets.** Inline the product's real logo SVG exactly. Don't invent a mark.

## Create and install

1. `links.json` already has a `board` URL? Revise that canvas and don't make another.
2. Otherwise create it from the Design artifact type (find its `type_url` with an Artifact `list`,
   `scope: "types"`; `title` "<App> board", `auto_open: "after_first_write"`). Write the URL to
   `links.json`.
3. Upload the picked concept images as assets (one `publish` with `asset: true` and `file_paths`),
   and record their `/_blob/` URLs in `design/board/assets.json` for the generator's Concepts row.
4. Run the generator, then `scripts/coverage.mjs`, and fix anything until it exits 0.
5. First publish: `project/canvas.json`, `project/Main.dc.html`, and the design-system install
   (`"project/ds/<namespace>/tokens.json": {"artifact": "<system url>", "path": "project/tokens.json"}`,
   with a `designSystems` record in canvas.json carrying the system's version id). Then publish one
   call per flow row, flagship row first, with a one-line update in chat after each.

**Revising later:** `read` the live `project/canvas.json` right before publishing a changed
index, because the user may have moved things. To refresh the design-system copy after the system
changes, first `read` `project/ds/<namespace>/tokens.json` on the canvas. The server made that copy,
so a publish that replaces it unread is refused. Then send the `{"artifact", "path"}` entry again,
with the system's new version id in the `designSystems` record.

## Phone screens that hold up in review

Reviews find the same layout faults again and again. Build them in from the start:
- **Every screen scrolls** (`overflow-y: auto`, and children `flex-shrink: 0` so rules and dividers
  don't collapse). The phone frame takes the artboard's height, so a tall artboard shows the
  scrolled-open screen with its tab bar at the bottom.
- **The primary action is docked**, not at the end of the content: above the tab bar on every tab,
  with confirmations as a toast in the same dock.
- **Sheets are dialogs**: `role="dialog"`, named by an h2 title, a Close button, `inert` on everything
  behind, and a scrolling body capped at about 88% of the screen.
- **Real controls**: switches as `input role="switch"` inside a full-row label, radios as real
  radios, actions as buttons, and links only where Play should navigate.
- **No status colour that matches a category colour.** If categories are colours, switches and
  success states are ink.

## Interactive

- `is_interactive: true` on every artboard with working controls.
- Screens join through links styled as the control (`<a class="pl-btn">`), so Play walks the app.
- The flagship screen gets real behaviour in its logic class. For example, Done moves the next
  item up and Undo brings it back (state plus `<sc-for>` and `<sc-if>`). A multi-step flow such as
  a voice capture (listening, sorting, filed) is one artboard driven by `state`.
- Variants that only change copy (receipt types, a "rules only" state) are enum or boolean tweaks,
  not extra artboards.

## Done means

1. `node <skill folder>/scripts/coverage.mjs <project>/design/pages.json <project>/design/board/project/canvas.json`
   exits 0. Quote its last line to the user.
2. The review in `review.md` has run and its fixes are published.
3. The user has the link. Note that the canvas is private until they share it.
