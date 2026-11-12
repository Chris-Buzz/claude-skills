# Drawing the sprite sheets with ChatGPT

The app plays seven **strips**: wide images with one row of poses on a flat magenta background. ChatGPT draws them
from the user's photos; `tools/build_atlas.py` later keys out the magenta and lines the frames up. One strip per
prompt, all in the same ChatGPT chat so the character stays the same.

## Ground rules

- One request at a time in the user's visible ChatGPT window, and the user approves each image before it is saved.
  No loops or batches: OpenAI's Terms of Use bar automated extraction of output, and the risk is to the user's
  account. This is why the work stays slow, small and watched.
- Saving a file needs the user's yes. With `chatgpt-bridge`, say where it will go, then `chatgpt_save_image`. With
  Claude in Chrome, the user saves the image (right-click, Save image as) into `art/source/` under the name below.
- Nothing private goes into a prompt beyond the pet's photos the user chose to share.

## Driving ChatGPT

- **chatgpt-bridge:** `chatgpt_status` until `ready`; use one named chat for the whole pet (`chat: "pet <name>"`)
  so every prompt sees the earlier images. Images take 1 to 3 minutes: continue with `chatgpt_wait` on `pending`.
  Look at each result once with `chatgpt_view`.
- **Claude in Chrome:** open chatgpt.com in a new tab, start one chat, type each prompt, wait for the image, and
  read it from a screenshot.
- **Photos:** they go into the first message of that chat, from `art/photos/`. With Claude in Chrome, attach them
  with its file upload tool. With `chatgpt-bridge`, which sends text only, ask the user to drag the photos from
  `art/photos/` into the ChatGPT window, then send the prompt.

## 1. The base portrait

> Here are photos of my pet, `<name>`: `<the description the user approved>`. Draw `<name>` as a detailed
> pixel-art game sprite: sitting, facing the viewer, full body, with a clean dark outline one or two pixels wide.
> Keep the real markings, colours and eyes from the photos. One sprite alone on a flat, pure magenta background
> (#FF00FF), no shadow, no ground, no text.

Iterate with the user until it looks like their pet. Every later prompt starts from this image.

## 2. The seven strips

Send each prompt below after this shared part (fill in the count):

> Using the same `<name>` sprite as above, same style, size and outline: make a wide image with `<N>` poses in one
> horizontal row, evenly spaced with clear magenta gaps between them so no two poses touch. Every pose is the same
> size and sits on the same baseline. Flat, pure magenta background (#FF00FF). No shadow, ground, motion lines,
> sparkles, text, numbers or borders. The poses, left to right:

| Save as | Poses | Left to right | How the app uses it |
| --- | --- | --- | --- |
| `idle` | 6 | sitting neutral; eyes half shut; eyes shut; eyes open; a wink; neutral again | Rests on the first; plays the blink every few seconds |
| `working` | 6 | busy and focused: leaning in, concentrating, a small shift each frame, settles back | Loops while Claude works |
| `waiting` | 6 | looks up hopefully; starts lifting a front paw; paw higher; paw highest, eyes big; paw lowering; back to sitting | Loops while Claude needs the user |
| `done` | 6 | content: a stretch or yawn, a satisfied look, a head tilt, a little grooming, ending relaxed | Plays once when Claude finishes, holds the last pose |
| `droop` | 8 | ears and head slowly sink, eyes half shut, eyes shut from the sixth pose on, lowest and sleepy at the end | Blocked holds the last pose; asleep holds the sixth |
| `wave` | 4 | sitting; front paw rising; paw raised high in a wave; paw coming back down | A hello when Claude starts or the pet wakes |
| `run` | 8 | side view facing right: a running cycle with legs alternating, two poses in the air | Plays while the user drags the pet |

## 3. Check each strip before saving it

Count the poses and check: every pose whole (nothing cropped), clear magenta between every pair, the same size as
the base, flat magenta with no gradient or texture, nothing magenta-pink on the pet itself (it would be keyed out).
Ask ChatGPT to fix one thing at a time ("more space between the poses", "make every pose the same size as the first
one", "flat #FF00FF background only"). Save only what the user approves, as `art/source/<name>.png` (or `.webp`).

ChatGPT's own Pets feature (Settings, Pets, Create pet, in the ChatGPT desktop app) makes strips of this kind too;
if the user prefers it, save its strips under the names above and carry on with the atlas step.
