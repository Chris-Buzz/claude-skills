# council

A Claude Code skill that reviews a design document, a set of files or a codebase's structure with three kinds of
reviewer, then checks every finding against the source before it counts. Run it with
`/council <design|code|architecture> <target> [quick]`.

## Install

In Claude Code 2.1.275 or later, one line:

```
/plugin install council --marketplace Chris-Buzz/claude-skills
```

Or in two steps, on any version with plugins:

```
/plugin marketplace add Chris-Buzz/claude-skills
/plugin install council@chris-buzz
```

## Why three kinds of reviewer

Reviewers from one model share one set of blind spots. Council runs fresh Claude reviewers (no chat history, one
per lens: minimal, maintainable, secure, correct) alongside Codex and Gemini. They read the same packet without
seeing each other's answers. Then Claude opens the file and line behind every finding and marks it confirmed,
partly true, refuted or unclear. Findings only one reviewer raised get a second reviewer to try to refute them.
The report lists what two or more reviewers confirmed first, and what was refuted and why.

It reports and never edits your code.

## What leaves your machine

The packet (a short brief plus the files you choose, with line numbers) goes to OpenAI through Codex and to
Google through Antigravity. `scripts/packet.mjs` refuses:
- paths that look like secrets, keys, certificates or dependency folders;
- file text that looks like an API key or private key;
- files over 200 KB, and packets over 300 KB;
- anything matching `skills/council/blocked.txt`, your own never-send list.

**Before the first run, add your client folders and anything confidential to `blocked.txt`.** One regular
expression per line, matched against each file's path.

## Needs

- Claude Code.
- For the Codex seat: the official Codex plugin (`/plugin install codex@openai-codex`) and a signed-in Codex
  account.
- For the Gemini seat: the Antigravity command-line tool (`agy`) on your PATH.
- Node.js 18+.

`node skills/council/scripts/seat.mjs check` says which seats are ready. A seat that is not ready is skipped and
named in the report.

## Cost

A full run is four Claude reviewers, two outside reviewers and the verification reads. `quick` uses one Claude
generalist plus both outside seats, for a small diff.
