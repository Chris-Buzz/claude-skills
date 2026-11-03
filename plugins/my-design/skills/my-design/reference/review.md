# Feedback: other design skills review the board

Three advisors review the built board, each in its own subagent, so their long skill files never
enter the main context. Their findings are input: the user's picks and `taste.md` outrank them. The
main session triages, fixes, and reports.

## What each reviewer sees

Each reviewer gets:
- screenshots of every artboard, which give the rendered truth (see Rendering below);
- the artboard sources under `<project>/design/board/project/`;
- `design/brief.md` (audience, psychology rules, draft decisions), `design/concepts/picks.md` and
  the design system README, so they review against the chosen direction instead of their own
  defaults;
- `reference/taste.md`, labelled as the owner's standing preferences.

## The reviewers

Launch all three in one message (`Agent`, `model: "sonnet"`, in parallel). Each one loads its skill
with the Skill tool, reviews, and returns at most 12 findings, most severe first, in this shape:
`[severity: high|med|low] <artboard file> - <problem> -> <specific fix>`. They write no files.

1. **Design critique + audit** (the `impeccable` plugin if installed, or another design-review skill). Prompt: "Run `/impeccable critique`
   then `/impeccable audit` on these artboards. The surface mode is <Operate for app screens,
   Persuade for marketing pages>. The design direction is fixed and chosen by the owner, so judge
   execution, hierarchy, UX flow, states and accessibility within it, not the choice of direction."
   If the skill's launcher can't run, it reads the skill's reference files directly; that is fine.
2. **Taste pre-flight** (`design-taste-frontend` or a similar anti-slop skill, if installed). Prompt: "Run the skill's strict pre-flight check
   on these screens and flag anything that reads as templated or AI-default: default fonts,
   three-equal-cards, gradient washes, timid hierarchy, fake chrome, placeholder copy." Its dials
   follow the brief, not its own baseline.
3. **Accessibility pass** (`web-design-guidelines` if installed, plus the Design type's "Accessible as
   drawn" rules). Prompt: "Check contrast (4.5:1 text, 3:1 large text, icons, borders and focus), hit
   targets of at least 44px, real controls (button/a/input+label, no clickable divs), aria-labels on
   icon buttons, colour never the only cue, reduced motion, Dynamic Type headroom, and focus order
   through each flow." Rerun `scripts/contrast.mjs` on the system as part of this pass.

On a native-feeling phone app, add a native-UI review skill if you have one. That is optional, and
only when the platform calls for it.

## Rendering for review

Render every artboard to PNG locally:

```
node <skill folder>/scripts/render-board.mjs <project>/design/board <scratchpad>/review
node <skill folder>/scripts/render-board.mjs <project>/design/board <scratchpad>/review --theme light --only iphone
```

It emulates the artboard format (prop defaults, `renderVals()`, holes, `<sc-if>`, `<sc-for>`) in a
headless Chrome, using `playwright-core` (`npm install` once in the `scripts` folder), and screenshots each artboard at its
canvas size. Interactions don't run, and uploaded `/_blob/` images render blank. Artboard scripts
run only inside the sandboxed page, never in Node, because other people can edit a canvas.

Look at the flagship screens yourself first (Read the PNGs), then hand the folder to the
reviewers. The built-in browser pane is usually not signed in to claude.ai, so don't count on
screenshotting the live canvas, and never sign in for the user. Screenshots go to the scratchpad, not
the project.

## Triage and fix

1. Merge the findings and drop duplicates. Drop anything that contradicts the user's picks or `taste.md`,
   and say which ones were dropped and why.
2. Fix high and medium findings on the board, editing the artboard files and sending them in one
   call per the type's revising rules. Low findings are listed for the user and not applied.
3. Write `design/review.md`: each finding with its source skill and its outcome (fixed, rejected
   with reason, or left for the user).
4. Rerun the coverage check.

## Report to the user

In this order: the board link; the coverage check's last line; what changed from the review (three
to six lines); what was rejected because it fought the user's picks; and the open questions, if
any. Then ask what they want changed. That is the next loop.
