#!/usr/bin/env python3
"""
One-off migration: reclassify Instagram-carousel mergedMedia items that are
YouTube videos (carry youtubeId/youtubeUrl) from type:'video' -> type:'youtube'.

Why:
- Some IG carousel posts contain a YouTube video among their media items.
- Those mergedMedia items were stored with type:'video' + a youtube.com URL,
  so the admin tried to frame-capture them as local videos (which fails).
- Rendering/validation already treat youtubeId-bearing items as YouTube, so
  this change is safe and only normalizes the stored `type` field.

Scope:
- Only touches mergedMedia items that have a truthy youtubeId OR a
  youtube.com / youtu.be URL.
- Only changes type when it is currently NOT 'youtube' (idempotent).
- Backs up data/state.json to backups/data/ first.

Usage:
    python backfill_youtube_types.py            # dry-run (default)
    python backfill_youtube_types.py --apply    # write changes
"""
import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATE = ROOT / "data" / "state.json"
BACKUP_DIR = ROOT / "backups" / "data"

YOUTUBE_URL_RE = re.compile(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/))([A-Za-z0-9_-]+)", re.I)


def has_youtube(media):
    if not isinstance(media, dict):
        return False
    if media.get("youtubeId"):
        return True
    url = str(media.get("youtubeUrl") or media.get("url") or media.get("link") or "")
    return bool(YOUTUBE_URL_RE.search(url))


def backup_state():
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S-%f")[:-3]
    dest = BACKUP_DIR / f"state_{ts}.json"
    shutil.copy2(STATE, dest)
    print(f"[backup] {dest}")
    # keep only last 100
    backups = sorted(BACKUP_DIR.glob("state_*.json"))[::-1]
    for old in backups[100:]:
        old.unlink(missing_ok=True)


def main():
    apply = "--apply" in sys.argv
    with STATE.open("r", encoding="utf-8") as fh:
        state = json.load(fh)

    changed_items = []
    changed_media = []
    for item in state.get("items", []):
        merged = item.get("mergedMedia")
        if not isinstance(merged, list):
            continue
        item_touched = False
        for media in merged:
            if has_youtube(media) and media.get("type") != "youtube":
                media["type"] = "youtube"
                changed_media.append((item.get("id"), media.get("youtubeId")))
                item_touched = True
        if item_touched:
            changed_items.append(item.get("id"))

    print(f"[dry-run] would change {len(changed_media)} media item(s) across {len(changed_items)} post(s).")
    for pid, yt in changed_media:
        print(f"  post={pid} youtubeId={yt}")

    if not apply:
        print("[dry-run] No changes written. Re-run with --apply to write.")
        return

    backup_state()
    with STATE.open("w", encoding="utf-8") as fh:
        json.dump(state, fh, ensure_ascii=False, indent=2)
    print(f"[apply] Wrote {len(changed_media)} change(s) to {STATE}")


if __name__ == "__main__":
    main()
