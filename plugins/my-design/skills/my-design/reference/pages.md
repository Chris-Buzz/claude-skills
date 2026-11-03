# Page inventory: every page the app needs

The board must cover every page, so the inventory comes first and is checked by a script, not by
eye. It lives at `<project>/design/pages.json`, and `scripts/coverage.mjs` compares it with the
board's `canvas.json`.

## Where the pages come from

In this order. Note the source of each page in its `source` field.

1. **The code, if there is any.** Routes: expo-router `app/` files, Next.js `app/` or `pages/`,
   React Router config, Astro `src/pages/`, Flask/FastAPI routes that render HTML, and sheets and
   modals that act as pages.
2. **The product docs.** `product.md`, PRDs and plans list screens the code doesn't have yet. Docs
   also say what is cut, so don't design parked features.
3. **The checklist below.** Walk it for every surface and record each category either as page ids or
   as `"n/a: <reason>"`.
4. **The user.** Show them the inventory as a short list grouped by flow before the board is built,
   and add what they name.

## The checklist (`considered` in pages.json)

| Category | Typical pages |
| --- | --- |
| `entry` | landing, pricing, download/TestFlight, waitlist |
| `auth` | sign up, sign in, reset password, verify, or n/a when there are no accounts |
| `first_run` | welcome, in-context permission asks, setup/import, first empty state |
| `core` | the flagship screen, each primary nav destination, detail views |
| `create_edit` | capture/compose sheets, edit forms, confirm dialogs, pickers |
| `states` | empty, loading, error/offline, success/receipt, long content: on core screens at least |
| `navigation` | tab bar/sidebar, search, command palette, switchers |
| `notifications` | push/notification content, in-app toasts, banners |
| `settings` | settings root and each sub-page, account, data export/erase, about |
| `platform` | widgets, lock screen, watch, share sheet, email templates, OG images |
| `system` | 404, 500/maintenance, offline |
| `legal_support` | privacy, terms, support/FAQ, security, cookie banner if there is tracking |
| `responsive` | the phone version of every web page; tablet/desktop where they differ |

A state gets its own artboard when its layout differs, such as an empty state or a receipt. When
only copy or values change, cover it with a `data-props` tweak on the base artboard and list it in
`states`.

## pages.json

```json
{
  "app": "Example",
  "surfaces": [
    {"id": "iphone", "name": "iPhone app", "frame": "phone", "w": 390, "h": 844},
    {"id": "site", "name": "Website", "frame": "page", "w": 1280}
  ],
  "flows": ["Core loop", "Projects", "First run", "Settings", "Platform", "Website"],
  "pages": [
    {"id": "today", "name": "Today", "surface": "iphone", "flow": "Core loop",
     "file": "iphone/Today.dc.html", "states": ["running late (tweak)"], "source": "app/(tabs)/today.tsx"},
    {"id": "today-empty", "name": "Today, empty", "surface": "iphone", "flow": "Core loop",
     "file": "iphone/TodayEmpty.dc.html", "source": "checklist: states"}
  ],
  "considered": {
    "auth": "n/a: no accounts in v1 (product.md, 2026-10-12)",
    "core": ["today", "projects", "inbox"]
  }
}
```

- `file` is the artboard's path under `project/` in the canvas, and must end in `.dc.html`.
- Every page has exactly one `file`, and no two pages share one.
- `considered` must name every category in the checklist.

## Running the check

```
node <skill folder>/scripts/coverage.mjs <project>/design/pages.json <board-root>/project/canvas.json
```

It prints covered/missing/extra, then checks that each file exists next to the canvas and that every
checklist category is considered. Exit 0 means complete; exit 1 lists what is missing. Run it before
saying the board is done, and quote its last line.
