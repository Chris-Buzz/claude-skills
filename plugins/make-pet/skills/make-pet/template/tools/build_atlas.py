"""Build __PET_NAME__'s sprite atlas from the ChatGPT strips in art/source.

Each strip is a row of poses on a magenta background. This script keys out the magenta,
cuts the strip into frames, scales every strip so __PET_NAME__ is the same size in all of them,
stands every frame on one baseline, and packs the frames into one atlas laid out like
ChatGPT's pet sheets (8 columns, one state per row, cells twice ChatGPT's 192x208).

Outputs:
  public/pet/atlas.webp    the atlas the app draws from
  public/pet/atlas.json    cell size, and per state: row, frame count, frame timings
  public/pet/faces/*.png   __PET_NAME__'s face from each state's key frame, for the board
  art/contact-sheet.png       every frame on a checkerboard with the baseline, for checking

Run from the repo root:  python tools/build_atlas.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "art" / "source"
OUT = ROOT / "public" / "pet"

CELL_W, CELL_H = 384, 416  # ChatGPT's 192x208 cell at 2x
COLUMNS, ROWS = 8, 9
BASELINE = CELL_H - 8  # every seated frame's lowest pixel sits on this row

# Rows follow ChatGPT's sheet order. "scale" is relative to the idle strip: seated strips are
# matched on the width of their first frame (the base of a seated pet changes least between
# poses); the side-view run strip is drawn smaller in its source, so it gets a fixed factor.
# Durations are ChatGPT's own timings from its pet sheet contract.
STRIPS = [
    {"state": "idle", "row": 0, "file": "idle", "frames": 6,
     "durations": [280, 110, 110, 140, 140, 320]},
    {"state": "run-right", "row": 1, "file": "run", "frames": 8,
     "durations": [120] * 7 + [220], "scale": 1.6, "keep_bounce": True},
    {"state": "run-left", "row": 2, "mirror_of": "run-right"},
    {"state": "wave", "row": 3, "file": "wave", "frames": 4,
     "durations": [140, 140, 140, 280]},
    # Row 4 is ChatGPT's "jumping"; there is no strip for it, so it stays empty.
    {"state": "droop", "row": 5, "file": "droop", "frames": 8,
     "durations": [140] * 7 + [240]},
    {"state": "waiting", "row": 6, "file": "waiting", "frames": 6,
     "durations": [150] * 5 + [260]},
    {"state": "working", "row": 7, "file": "working", "frames": 6,
     "durations": [120] * 5 + [220]},
    {"state": "done", "row": 8, "file": "done", "frames": 6,
     "durations": [150] * 5 + [280]},
]

# The frame whose face stands for each state on the board.
FACE_FRAMES = {"idle": 0, "working": 1, "waiting": 3, "done": 4, "droop": 7, "asleep": 5}


def strip_path(name: str) -> Path:
    """A strip by file name, or by name alone (whatever image type it was saved as)."""
    path = SOURCE / name
    if path.suffix:
        return path
    found = sorted(SOURCE.glob(name + ".*"))
    if not found:
        raise SystemExit(f"missing strip: art/source/{name}.png (or .webp or .jpg)")
    return found[0]


def key_out_magenta(rgb: np.ndarray) -> np.ndarray:
    """Return RGBA with the magenta background made transparent.

    "Magenta-ness" is min(R, B) - G: about 200+ on the background, near 0 on the black
    outline, negative on __PET_NAME__'s browns. Pixels between the two thresholds are edge pixels
    that mix outline and background; their colour is un-mixed from the background colour so
    no pink fringe is left.
    """
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    magenta = np.minimum(r, b) - g
    lo, hi = 70.0, 170.0
    alpha = np.clip((hi - magenta) / (hi - lo), 0.0, 1.0)

    background = np.median(rgb[magenta > hi], axis=0)
    a = alpha[..., None]
    with np.errstate(divide="ignore", invalid="ignore"):
        fg = np.where(a > 0.02, (rgb - (1.0 - a) * background) / a, 0.0)
    fg = np.clip(fg, 0, 255)

    # Despill: the dark outline picked up a purple tint from the background. Where both red
    # and blue sit above green (magenta), pull them down to green's level. __PET_NAME__'s browns
    # (blue below green) and green eyes are untouched.
    spill = np.clip(np.minimum(fg[..., 0], fg[..., 2]) - fg[..., 1], 0, None)
    fg[..., 0] -= spill
    fg[..., 2] -= spill

    # Drop specks of noise in the background: keep only blobs of a real size.
    solid = alpha > 0.5
    labels, count = ndimage.label(solid)
    if count:
        sizes = ndimage.sum(solid, labels, range(1, count + 1))
        keep = np.isin(labels, np.flatnonzero(sizes >= 400) + 1)
        near_keep = ndimage.binary_dilation(keep, iterations=3)
        alpha = np.where(near_keep, alpha, 0.0)

    return np.dstack([fg, alpha * 255.0])


def cut_frames(rgba: np.ndarray, expected: int) -> list[tuple[np.ndarray, int]]:
    """Split a strip into frames at the empty columns between poses.

    Returns each pose cropped tight, with the strip row its lowest pixel was on (the run
    strip uses that to keep its leaps).
    """
    solid = rgba[..., 3] > 128
    filled = solid.sum(axis=0) > 3
    runs, start = [], None
    for x, on in enumerate(filled):
        if on and start is None:
            start = x
        elif not on and start is not None:
            if x - start > 20:
                runs.append((start, x))
            start = None
    if start is not None:
        runs.append((start, len(filled)))
    if len(runs) != expected:
        raise SystemExit(f"expected {expected} frames, found {len(runs)}")

    frames = []
    for x0, x1 in runs:
        rows = np.flatnonzero(solid[:, x0:x1].sum(axis=1) > 2)
        frames.append((rgba[rows[0] : rows[-1] + 1, x0:x1], int(rows[-1])))
    return frames


def resize(frame: np.ndarray, scale: float) -> Image.Image:
    img = Image.fromarray(frame.round().astype(np.uint8), "RGBA")
    size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    # Premultiplied resampling keeps transparent pixels from bleeding dark into the edge.
    return img.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")


def base_center_x(img: Image.Image) -> float:
    """Horizontal centre of the bottom quarter of the pose: the seated base moves least."""
    a = np.asarray(img)[..., 3].astype(float)
    bottom = a[int(a.shape[0] * 0.75) :]
    cols = bottom.sum(axis=0)
    return float((cols * np.arange(len(cols))).sum() / max(cols.sum(), 1.0))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "faces").mkdir(exist_ok=True)
    atlas = Image.new("RGBA", (CELL_W * COLUMNS, CELL_H * ROWS), (0, 0, 0, 0))

    loaded: dict[str, list[tuple[np.ndarray, int]]] = {}
    for strip in STRIPS:
        if "file" in strip:
            rgb = np.asarray(Image.open(strip_path(strip["file"])).convert("RGB")).astype(float)
            loaded[strip["state"]] = cut_frames(key_out_magenta(rgb), strip["frames"])

    idle_width = loaded["idle"][0][0].shape[1]
    tallest = max(
        f.shape[0] * (idle_width / frames[0][0].shape[1])
        for state, frames in loaded.items() if state != "run-right" for f, _ in frames
    )
    fit = (BASELINE - 6) / tallest  # one factor for all strips so the tallest pose still fits

    placed: dict[str, list[Image.Image]] = {}
    meta = {"cell": {"w": CELL_W, "h": CELL_H}, "columns": COLUMNS, "states": {}}

    for strip in STRIPS:
        state = strip["state"]
        if "mirror_of" in strip:
            source = placed[strip["mirror_of"]]
            cells = [c.transpose(Image.FLIP_LEFT_RIGHT) for c in source]
            durations = meta["states"][strip["mirror_of"]]["durations"]
        else:
            frames = loaded[state]
            scale = fit * strip.get("scale", idle_width / frames[0][0].shape[1])
            imgs = [resize(f, scale) for f, _ in frames]
            ground = max(bottom for _, bottom in frames)
            cells = []
            for i, img in enumerate(imgs):
                cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
                if strip.get("keep_bounce"):
                    # The run strip's leaping frames sit higher on purpose; keep that lift.
                    lift = round((ground - frames[i][1]) * scale)
                    x = round(CELL_W / 2 - img.width / 2)
                    y = BASELINE - img.height - lift
                else:
                    x = round(CELL_W / 2 - base_center_x(img))
                    y = BASELINE - img.height
                if x < 0 or x + img.width > CELL_W or y < 0:
                    raise SystemExit(f"{state} frame {i} does not fit the cell ({img.size} at {x},{y})")
                cell.alpha_composite(img, (x, y))
                cells.append(cell)
            durations = strip["durations"]

        placed[state] = cells
        for col, cell in enumerate(cells):
            atlas.alpha_composite(cell, (col * CELL_W, strip["row"] * CELL_H))
        meta["states"][state] = {"row": strip["row"], "frames": len(cells), "durations": durations}

    atlas.save(OUT / "atlas.webp", lossless=True, method=6)
    (OUT / "atlas.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    write_faces(placed)
    write_contact_sheet(placed)
    print(f"atlas {atlas.size}, {sum(len(c) for c in placed.values())} frames, fit {fit:.3f}")


def write_faces(placed: dict[str, list[Image.Image]]) -> None:
    """Crop a square around __PET_NAME__'s head from each state's key frame (for the board's rows)."""
    for name, frame in FACE_FRAMES.items():
        state = "droop" if name == "asleep" else name
        cell = placed[state][frame]
        a = np.asarray(cell)[..., 3]
        rows = np.flatnonzero(a.max(axis=1) > 128)
        cols = np.flatnonzero(a.max(axis=0) > 128)
        top = rows[0]
        center = (cols[0] + cols[-1]) / 2
        side = round((cols[-1] - cols[0]) * 0.78)
        box = (round(center - side / 2), top, round(center + side / 2), top + side)
        cell.crop(box).resize((96, 96), Image.LANCZOS).save(OUT / "faces" / f"{name}.png")
        if name == "idle":
            # Source for the app and tray icons: `npx tauri icon art/icon.png -o src-tauri/icons`
            cell.crop(box).resize((1024, 1024), Image.LANCZOS).save(ROOT / "art" / "icon.png")


def write_contact_sheet(placed: dict[str, list[Image.Image]]) -> None:
    half_w, half_h = CELL_W // 2, CELL_H // 2
    label_w = 120
    sheet = Image.new("RGBA", (label_w + half_w * COLUMNS, half_h * len(placed)), (255, 255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    for y in range(0, sheet.height, 16):
        for x in range(label_w, sheet.width, 16):
            if (x // 16 + y // 16) % 2:
                draw.rectangle([x, y, x + 15, y + 15], fill=(232, 232, 232, 255))
    for r, (state, cells) in enumerate(placed.items()):
        top = r * half_h
        draw.text((10, top + half_h // 2), state, fill=(0, 0, 0, 255))
        base_y = top + BASELINE // 2
        draw.line([label_w, base_y, sheet.width, base_y], fill=(255, 90, 0, 255), width=1)
        for c, cell in enumerate(cells):
            sheet.alpha_composite(cell.resize((half_w, half_h), Image.LANCZOS), (label_w + c * half_w, top))
    sheet.convert("RGB").save(ROOT / "art" / "contact-sheet.png")


if __name__ == "__main__":
    main()
