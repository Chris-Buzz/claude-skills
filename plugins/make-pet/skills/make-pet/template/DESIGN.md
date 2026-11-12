# __PET_NAME__: design brief

**Audience.** One person at their desk with Claude Code sessions running. **Mood.** A calm pet on the corner of the
desk, not a mascot asking for attention: it moves when Claude's work changes or when it is touched, and otherwise
sits and blinks. **Look.** The pet's own sprites standing on nothing: no frame, card or shadow. The only UI on the
desktop is a small status pill under it, true black with white Geist text, shown only when there is something to
say. **Palette.** White, true black, and one vivid orange (#ff6a1a) for what needs the user and for the live mic.
**Motion.** Frame timings in `public/pet/atlas.json`; the pill fades in 150 ms; nothing loops at rest except a blink.

## Poses

| State | Strip | How it plays |
| --- | --- | --- |
| Idle | `idle` | holds the first frame; plays the blink frames every 6 to 9 s |
| Working | `working` | loops |
| Needs you | `waiting` | loops with a 1 s rest |
| Done | `done` | plays once, holds the last frame |
| Blocked | `droop` | plays once, holds the last frame |
| Asleep | `droop` | plays slowly to the sixth frame (eyes shut) and holds it |
| Dragging | `run` | loops, mirrored when moving left |
| Hello and waking | `wave` | plays once |

## The board

A white card beside the pet. The header says what needs the user ("1 needs you · 3 working") with the pet's face in
the matching pose. Groups that need the user come first, then live ones, then quiet ones; the order changes only
when something meaningful happens, so rows stay put while the user reaches for one. Quiet sessions step back in
grey. Each row opens to show the last exchange, a filled Show Claude button, and the session's numbers.
