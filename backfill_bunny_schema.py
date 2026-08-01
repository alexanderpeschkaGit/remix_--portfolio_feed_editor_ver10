#!/usr/bin/env python3
"""
Backfill the canonical Bunny media schema in data/state.json.

For every media item of type "bunny" (or with videoId+libraryId):
  1. url + image_original = the embed URL (never an image)
  2. bunnyThumbUrl     = deterministic Bunny CDN thumbnail (never "")
  3. type              = "bunny"
  4. Canonical base name: bunny-{videoId}. Old local `vidbunny-{ts}*` files
     are copied to `bunny-{videoId}_*` and state URLs are rewritten.
  5. Missing 2k/3k variants are regenerated from the best available local
     source (existing 1k/2k/3k, else Bunny CDN thumbnail via HTTP).
  6. image = best of the variant set (2k -> 3k -> 1k -> thumb).

Writes a report to Connect_front_back.md (per .cursorrules logging rule).

Usage:
    python backfill_bunny_schema.py [--dry-run]
"""
import json
import os
import shutil
import sys
from urllib.parse import urlparse, unquote

from PIL import Image

from image_variants import build_variant_set_from_image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

STATE_PATH = os.path.join("data", "state.json")
CONNECT_PATH = "Connect_front_back.md"
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}

# subdir -> (state field, filename suffix)
VARIANT_MAP = [
    ("thumbs400", "image_thumb", "thumb"),
    ("1k", "image_1k", "1k"),
    ("2k", "image_2k", "2k"),
    ("3k", "image_3k", "3k"),
    ("originals", "image_original", "original"),
]
# Fields that must NEVER be overwritten with the variant set on a bunny item
# (image_original is always the embed URL by contract).
MERGE_FIELDS = ("image_thumb", "image_1k", "image_2k", "image_3k", "image", "image_large")


def embed_url(media):
    return f"https://iframe.mediadelivery.net/embed/{media['libraryId']}/{media['videoId']}"


def cdn_thumb_url(media):
    return f"https://iframe.mediadelivery.net/{media['libraryId']}/{media['videoId']}/thumbnail.jpg"


def is_bunny(media):
    return (media.get("type") == "bunny") or (bool(media.get("videoId")) and bool(media.get("libraryId")))


def url_to_local(url):
    """Map a state URL to a local data_v2 path, or None."""
    if not url:
        return None
    clean = url.split("#")[0].split("?")[0].strip()
    if clean.startswith(("http://", "https://")):
        clean = urlparse(clean).path
    clean = unquote(clean).replace("\\", "/").lstrip("/")
    if clean.startswith("v2/data/"):
        clean = "data_v2/" + clean[len("v2/data/"):]
    if clean.startswith("data_v2/"):
        return os.path.normpath(clean)
    if clean.startswith("data/") or clean.startswith("originals/"):
        return os.path.normpath(clean)
    return None


def best_local_source(media):
    """Best local image file to regenerate variants from (prefer non-thumb)."""
    for field in ("image_1k", "image_2k", "image_3k", "image_original", "image_large", "image"):
        local = url_to_local(media.get(field))
        if not local or not os.path.isfile(local):
            continue
        if os.path.splitext(local)[1].lower() not in IMAGE_EXT:
            continue
        normalized = local.replace("\\", "/").lower()
        if "/thumbs400/" in normalized or normalized.endswith("_thumb.jpg"):
            continue
        return local
    for field in ("image_thumb", "image"):
        local = url_to_local(media.get(field))
        if local and os.path.isfile(local) and os.path.splitext(local)[1].lower() in IMAGE_EXT:
            return local
    return None


def regenerate_variants(media, report, dry_run):
    """Fill missing 2k/3k from a local source that is large enough to produce them."""
    vid = media.get("videoId")
    if media.get("image_2k") and media.get("image_3k"):
        return media, 0
    out = dict(media)
    changed = 0

    source = best_local_source(out)
    if not source:
        report.append(f"{vid}: keine lokale Quelle fuer fehlende Varianten")
        return out, 0
    try:
        with Image.open(source) as image:
            src_max = max(image.size)
    except Exception:
        report.append(f"{vid}: Quelle nicht lesbar ({source})")
        return out, 0

    # Only regenerate when the source can actually produce a 2k (>= 2048px).
    # Smaller sources would only clobber existing 1k/thumb files with downscaled
    # copies, so we leave the current variants untouched instead.
    if src_max < 2048:
        report.append(f"{vid}: Quelle zu klein fuer 2k/3k ({src_max}px) - Varianten bleiben leer")
        return out, 0

    try:
        result = build_variant_set_from_image(source, "uploads", f"bunny-{vid}")
        for field in MERGE_FIELDS:
            value = result["urls"].get(field)
            if not value:
                continue
            if field in ("image_2k", "image_3k", "image_large") or not out.get(field):
                if out.get(field) != value:
                    out[field] = value
                    changed += 1
        if result.get("width") and result.get("height"):
            if out.get("image_width") != result["width"] or out.get("image_height") != result["height"]:
                out["image_width"] = result["width"]
                out["image_height"] = result["height"]
                changed += 1
        if result.get("missing_variants"):
            report.append(f"{vid}: Quelle zu klein fuer {', '.join(result['missing_variants'])}")
    except Exception as error:
        report.append(f"{vid}: Variantengenerierung fehlgeschlagen ({error})")
    return out, changed


def rename_old_vidbunny_files(media, report, dry_run):
    """Copy local vidbunny-{ts}* files to bunny-{videoId}_*; return (media, changed)."""
    vid = media.get("videoId")
    if not vid:
        return media, 0
    out = dict(media)
    changed = 0
    for subdir, fkey, suffix in VARIANT_MAP:
        val = out.get(fkey)
        if not val:
            continue
        local = url_to_local(val)
        if not local or not os.path.isfile(local):
            continue
        name = os.path.basename(local)
        if not name.startswith("vidbunny-"):
            continue
        ext = os.path.splitext(name)[1]
        new_name = f"bunny-{vid}_{suffix}{ext}"
        new_local = os.path.join(os.path.dirname(local), new_name)
        if not dry_run and os.path.abspath(local) != os.path.abspath(new_local):
            if os.path.isfile(new_local):
                os.remove(new_local)
            shutil.copy2(local, new_local)
        dir_part = os.path.dirname(val)
        new_val = f"{dir_part}/{new_name}".replace("\\", "/")
        if out.get(fkey) != new_val:
            out[fkey] = new_val
            changed += 1
            report.append(f"{vid}: renamed {name} -> {new_name}")
    return out, changed


def regenerate_variants(media, report, dry_run):
    """Fill missing 2k/3k from best local source (or Bunny CDN thumb)."""
    vid = media.get("videoId")
    if media.get("image_2k") and media.get("image_3k"):
        return media, 0
    out = dict(media)
    changed = 0

    source = best_local_source(out)
    downloaded = None
    if not source:
        downloaded = download_bunny_thumb(out)
        source = downloaded
    if not source:
        report.append(f"{vid}: keine Quelle fuer fehlende Varianten (2k/3k)")
        return out, 0

    try:
        result = build_variant_set_from_image(source, "uploads", f"bunny-{vid}")
        for field in MERGE_FIELDS:
            value = result["urls"].get(field)
            if not value:
                continue
            if field in ("image_2k", "image_3k", "image_large") or not out.get(field):
                if out.get(field) != value:
                    out[field] = value
                    changed += 1
        if result.get("width") and result.get("height"):
            if out.get("image_width") != result["width"] or out.get("image_height") != result["height"]:
                out["image_width"] = result["width"]
                out["image_height"] = result["height"]
                changed += 1
        if result.get("missing_variants"):
            report.append(f"{vid}: Quelle zu klein fuer {', '.join(result['missing_variants'])}")
    except Exception as error:
        report.append(f"{vid}: Variantengenerierung fehlgeschlagen ({error})")
    finally:
        if downloaded:
            try:
                os.remove(downloaded)
            except OSError:
                pass
    return out, changed


def process_media(media, report, dry_run):
    if not is_bunny(media):
        return media, 0
    vid = media.get("videoId")
    lib = media.get("libraryId")
    embed = embed_url(media)
    thumb = cdn_thumb_url(media)
    out = dict(media)
    changed = 0

    if out.get("type") != "bunny":
        out["type"] = "bunny"
        changed += 1
    if out.get("url") != embed:
        out["url"] = embed
        changed += 1
    if out.get("image_original") != embed:
        out["image_original"] = embed
        changed += 1
    if not out.get("bunnyThumbUrl"):
        out["bunnyThumbUrl"] = thumb
        changed += 1

    out, n_renamed = rename_old_vidbunny_files(out, report, dry_run)
    changed += n_renamed

    out, n_variants = regenerate_variants(out, report, dry_run)
    changed += n_variants

    best = out.get("image_2k") or out.get("image_3k") or out.get("image_1k") or out.get("image_thumb") or out.get("image") or ""
    if best and out.get("image") != best:
        out["image"] = best
        changed += 1

    return out, changed


def append_batch_report(lines):
    from datetime import datetime, UTC
    timestamp = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    section = ["", "## Bunny Schema Backfill Report", f"- Timestamp: {timestamp}"]
    section.extend([f"- {line}" for line in lines] if lines else ["- Keine Aenderungen/noetigen Schritte protokolliert."])
    existing = ""
    if os.path.exists(CONNECT_PATH):
        with open(CONNECT_PATH, "r", encoding="utf-8") as handle:
            existing = handle.read().rstrip() + "\n"
    with open(CONNECT_PATH, "w", encoding="utf-8") as handle:
        handle.write(existing + "\n".join(section) + "\n")


def main():
    dry_run = "--dry-run" in sys.argv
    if not os.path.exists(STATE_PATH):
        print(f"[ERROR] {STATE_PATH} nicht gefunden")
        return 1
    with open(STATE_PATH, "r", encoding="utf-8") as handle:
        state = json.load(handle)

    report = []
    bunny_media = 0
    total_changes = 0
    new_items = []
    for item in state.get("items", []):
        item, n = process_media(item, report, dry_run)
        total_changes += n
        if is_bunny(item):
            bunny_media += 1
        if isinstance(item.get("mergedMedia"), list):
            merged = []
            for media in item["mergedMedia"]:
                media, n = process_media(media, report, dry_run)
                total_changes += n
                if is_bunny(media):
                    bunny_media += 1
                merged.append(media)
            item["mergedMedia"] = merged
        new_items.append(item)
    state["items"] = new_items

    if not dry_run and total_changes:
        state["lastUpdated"] = __import__("datetime").datetime.now(__import__("datetime").UTC).isoformat().replace("+00:00", "Z")
        with open(STATE_PATH, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, ensure_ascii=False)
        append_batch_report(report)

    # Verification summary
    non_conforming = 0
    for item in state.get("items", []):
        for media in ([item] + (item.get("mergedMedia") or [])):
            if not is_bunny(media):
                continue
            embed = embed_url(media)
            if media.get("image_original") != embed or not media.get("bunnyThumbUrl"):
                non_conforming += 1
                report.append(f"{media.get('videoId')}: NICHT konform (image_original/bunnyThumbUrl)")

    mode = "DRY-RUN" if dry_run else "AUSGEFUEHRT"
    print(f"[{mode}] Bunny-Media-Items: {bunny_media}")
    print(f"[{mode}] Aenderungen: {total_changes}")
    print(f"[{mode}] Nicht konform nach Verarbeitung: {non_conforming}")
    print(f"[{mode}] Report-Zeilen: {len(report)}")
    for line in report:
        print("  -", line)
    return 0 if non_conforming == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
