"""Creates a desktop-pet project from the make-pet template.

    python new_pet.py --name "Biscuit" --dest "C:/Projects/biscuit-pet" --owner alex

Copies ../template to --dest and fills in the four placeholders:
  __PET_NAME__  the pet's display name ("Biscuit")
  __PET_SLUG__  a lowercase form for folders, the package and the data path ("biscuit")
  __PET_LIB__   the Rust library name ("biscuit_pet_lib")
  __PET_ID__    the app identifier Windows uses for its data folder ("com.alex.biscuit-pet")
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent.parent / "template"
# The name lands in JSON, HTML and Rust string literals, so quotes and backslashes are refused.
NAME_RULE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .\-]{0,30}$")


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "pet"


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a desktop-pet project from the make-pet template.")
    parser.add_argument("--name", required=True, help='the pet\'s name, e.g. "Biscuit"')
    parser.add_argument("--dest", required=True, help="a new or empty folder for the project")
    parser.add_argument("--owner", default="local", help="your name or GitHub handle, used in the app identifier")
    args = parser.parse_args()

    if not NAME_RULE.match(args.name):
        sys.exit("Use letters, numbers, spaces, dots or dashes in the name (up to 31 characters).")
    dest = Path(args.dest).expanduser().resolve()
    if dest.exists() and any(dest.iterdir()):
        sys.exit(f"{dest} already has files in it. Pick a new or empty folder.")

    slug = slugify(args.name)
    tokens = {
        "__PET_NAME__": args.name,
        "__PET_SLUG__": slug,
        "__PET_LIB__": slug.replace("-", "_") + "_pet_lib",
        "__PET_ID__": f"com.{slugify(args.owner)}.{slug}-pet",
    }

    shutil.copytree(TEMPLATE, dest, dirs_exist_ok=True)
    for path in dest.rglob("*"):
        if path.is_file():
            text = path.read_text(encoding="utf-8")
            for token, value in tokens.items():
                text = text.replace(token, value)
            path.write_text(text, encoding="utf-8", newline="\n")
    (dest / "art" / "source").mkdir(parents=True, exist_ok=True)

    print(f"Created {args.name} in {dest}")
    print(f"  app identifier: {tokens['__PET_ID__']}")
    print(f"  session files:  ~/.claude/{slug}-pet/sessions")
    print(f"  sprite strips go in: {dest / 'art' / 'source'}")


if __name__ == "__main__":
    main()
