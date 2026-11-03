# my-design

A Claude Code skill for designing a whole app or site, from nothing to a reviewed board of every page.
Run it with `/my-design <app or folder>`.

## Install

In Claude Code 2.1.275 or later, one line:

```
/plugin install my-design --marketplace Chris-Buzz/claude-skills
```

Or in two steps, on any version with plugins:

```
/plugin marketplace add Chris-Buzz/claude-skills
/plugin install my-design@chris-buzz
```

## What it does

1. **Brief and page inventory.** Reads the code and docs, and lists every page the product needs against a
   checklist (entry, auth, first run, core, states, settings, platform, legal and more).
2. **Psychology research.** A background agent researches who uses the product and in what state, and
   returns design rules with sources.
3. **Draft the system with you.** A fixed base (evidence and your taste) and two to four open questions.
4. **Concepts.** ChatGPT draws four directions through the chatgpt-bridge plugin, and you pick or mix.
5. **Publish the design system** as a claude.ai Design System artifact, with every colour pair checked
   for contrast.
6. **The board.** A claude.ai Design canvas with every page as an interactive artboard. A script checks
   that no page is missing.
7. **Review.** Design, anti-slop and accessibility skills review the board in parallel; high and medium
   findings get fixed.
8. **Report and iterate.**

Everything for one project lands in `<project>/design/`, so a later session picks up where the last one
stopped.

## Make it yours

`skills/my-design/reference/taste.md` is a template. Fill it with your own design preferences (what you
reach for, what reads as slop to you, how you want copy to sound). Every design system the skill drafts
starts from it, and your concept picks outrank it.

## Needs

- Claude Code with claude.ai artifacts, including the Design and Design System artifact types.
- The [chatgpt-bridge](../chatgpt-bridge) plugin for the concept round (or the Claude in Chrome extension
  as a fallback).
- Node.js 18+. For screenshots in the review step, run `npm install` once in `skills/my-design/scripts`.
- Optional review skills: a design critique skill, an anti-slop skill and an accessibility skill.

See `skills/my-design/reference/setup.md` for the full checklist.
