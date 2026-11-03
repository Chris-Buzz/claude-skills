---
name: council
description: "A multi-reviewer review for designs, code and architecture: fresh Claude reviewers plus Codex and Antigravity (Gemini) each read the same packet blind, then every finding is checked against the source before it counts. Aims at minimal, clean, maintainable, secure, correct. Use for /council <design|code|architecture> <target>. Heavy and sends code to OpenAI and Google, so only on request."
argument-hint: "design|code|architecture <path or area> [quick]"
disable-model-invocation: true
---

# Council

One review, three kinds of reviewer, and a verification step. It builds on the Elephant-Goldfish idea (fresh reviewers with no chat history) and adds other models, because reviewers from one model share one set of blind spots. It reports; it never edits the code.

Paths below are relative to this skill's folder (the base directory shown when the skill loads).

**Seats.** Claude lens reviewers (fresh subagents, read-only), Codex (default model in `scripts/seat.mjs`), Antigravity on Gemini. Run `node scripts/seat.mjs check` first; a seat that is not ready is skipped and said so in the report. Fewer than two model families means the report says "not a council".

**Never.** Never send confidential, client or regulated material, anything under `.cert`, `.env`, keys or tokens, or a repo the user has not named. `packet.mjs` refuses paths and text that look like secrets, and every path matching `blocked.txt` (the user's own never-send list; ask them to add their client and confidential folders before the first run). Do not work around a refusal. Never pass `--dangerously-skip-permissions` to `agy`. Never let a seat write to the project: seats run in a throwaway folder that holds only the packet. That folder does not stop reads: Codex can read any file on this machine, so a reviewed file carrying instructions could pull other files into what goes to OpenAI. Run council only on code whose contents you trust that far.

## Steps

1. **Scope.** Mode is `design` (a design document), `code` (named files or a diff) or `architecture` (a package, layer or the whole repo's structure). Ask only if the target is unclear. `quick` skips the Claude lens fan-out in step 3.
2. **Free evidence first.** Run what the repo already has: tests, typecheck, lint, the layer check, `npm audit`. Record exact output lines. A failing check is a finding already; do not pay models to rediscover it.
3. **Brief and packet.** Write `brief.md`: facts only (what it is, the layers and rules it must follow, what is trusted, what is already known and accepted, what is out of scope). No opinions and no suspected problems, so no reviewer is anchored. Then build the packet:
   `node scripts/packet.mjs <outDir> --mode <mode> --brief brief.md --root <repo> <files...>`
   Include the files that the target's risky calls reach, one step out (a function it calls with a value it did not check): outside seats see only the packet, so a bug one file away is invisible to them otherwise.
   For `architecture`, include the file tree (`git ls-files`), the dependency or layer rules, entry points, interface files and the architecture doc, not every file. Keep packets under 300 KB.
4. **Round 1, blind and parallel.** Start the outside seats in the background:
   `node scripts/seat.mjs codex <outDir> <outDir>/seat-codex.md`
   `node scripts/seat.mjs gemini <outDir> <outDir>/seat-gemini.md`
   At the same time start the Claude seats as fresh read-only subagents (`Explore`, model `sonnet`), one per lens (Minimal, Maintainable, Secure, Correct), each given the brief, the target paths and `references/seat-prompt.md`'s rules and format. For `design` mode, if the `egm` plugin is installed, use its reviewers instead (`egm-zoom-out`, `egm-design`, `egm-implementation-readiness`, `egm-codebase-details`) and its standards, because they are built for documents. Seats do not see each other's answers. A seat that fails twice is recorded as "not run", never as "found nothing".
5. **Verify.** Open the file and line behind every finding yourself. Mark each Confirmed, Partly (say what is true), Refuted (say why) or Cannot tell. A finding with no location, or that the source contradicts, is dropped and listed with the seat that made it. Keep a tally of refuted findings per seat; it tells you which seat to trust less next time.
6. **Cross-examine.** For each Blocker or Major that only one seat raised, or that seats disagree on, give a different seat the claim and the code and ask it to refute the claim with evidence (a small packet, same runner). Do this for at most six findings.
7. **Report.** Write `council-report.md` next to the packet (in the repo's `docs/reviews/<date>-<slug>/` if it has a `docs` folder, else `.council/`). Order: verdict in two lines; Confirmed by two or more seats; Confirmed by one seat; the cut list (what to delete, lines saved); questions only the owner can answer; Refuted and dropped, with reasons; seats run and not run, models, and the free-evidence output. Findings are ranked by what breaks or costs most, not by who found them. Tell the user the path and the three most important findings. Do not fix anything unless asked.

## Rules for every reviewer

Cite `path:line`. Give a scenario or an exact change. No praise, no "consider". Say "unsure" when unsure. These are in `references/seat-prompt.md`, which the packet builder copies into the outside seats' prompt and which the Claude seats are given.

## Cost

A full run is 4 Claude seats, 2 outside seats and the verification reads. Use `quick` (one Claude generalist, both outside seats) for a small diff. Use the full run for a design, a release gate or a security-sensitive area.

## Notes on the seats

- Codex runs through the official Codex plugin for Claude Code (`codex@openai-codex`): `task` with `--prompt-file`, read-only unless `--write`. The packet goes inside the prompt and the run starts in an empty folder. Change the model with `--model`.
- Antigravity: `agy -p=<prompt> --mode plan` with one narrow `read_file` allow rule for `packet.md`. `--mode plan` does not stop file writes, which is why it runs in a throwaway folder. It reads the packet with `read_file` and gets no shell. A denied tool call aborts the whole run with no output, so the prompt never invites other reads.
- `agy` ignores piped stdin when `-p` is used, and `-p` must be written `-p=...` if flags follow.
