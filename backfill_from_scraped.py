#!/usr/bin/env python3
"""Backfill dimensions from scraped per-media records without post-level copying."""
import json
import os
import sys
from urllib.parse import unquote, urlparse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

IMAGE_FIELDS = ["image_original", "image_3k", "image_2k", "image_large", "image_1k", "image_thumb", "image"]


def basename_tokens(media):
    tokens = set()
    for field in IMAGE_FIELDS:
        value = media.get(field)
        if not isinstance(value, str) or not value:
            continue
        pathname = urlparse(value).path if value.startswith(("http://", "https://")) else value
        name = os.path.basename(unquote(pathname)).lower()
        if name:
            tokens.add(name)
    return tokens


def load_scraped_records():
    records = {}
    for filename in ("data/flickr/flickr_data.json", "data/instagram/insta_data.json"):
        try:
            with open(filename, "r", encoding="utf-8") as handle:
                for item in json.load(handle):
                    records.setdefault(str(item.get("id", "")), []).append(item)
        except Exception as error:
            print(f"Skipped {filename}: {error}")
    return records


def dimensions(media):
    width = media.get("image_width")
    height = media.get("image_height")
    return (width, height) if width and height else None


def match_source_media(target, candidates):
    target_tokens = basename_tokens(target)
    matches = [candidate for candidate in candidates if target_tokens & basename_tokens(candidate)]
    return matches[0] if len(matches) == 1 else None


def backfill_from_scraped(state_path="data/state.json"):
    records = load_scraped_records()
    try:
        with open(state_path, "r", encoding="utf-8") as handle:
            state = json.load(handle)
    except Exception as error:
        print(f"Could not read {state_path}: {error}")
        return False

    updated = 0
    ambiguous = 0
    for item in state.get("items", []):
        sources = records.get(str(item.get("id", "")), [])
        if not sources:
            continue
        target_media = item.get("mergedMedia") or [item]
        source_media = []
        for source in sources:
            source_media.extend(source.get("media_list") or [source])

        for index, target in enumerate(target_media):
            if dimensions(target):
                continue
            source = match_source_media(target, source_media)
            if source is None and len(target_media) == len(source_media):
                source = source_media[index]
            source_dimensions = dimensions(source or {})
            if not source_dimensions:
                ambiguous += 1
                continue
            target["image_width"], target["image_height"] = source_dimensions
            updated += 1

        if item.get("mergedMedia") and dimensions(target_media[0]):
            item["image_width"], item["image_height"] = dimensions(target_media[0])

    print(f"Updated {updated} media; unresolved or ambiguous {ambiguous}.")
    if updated:
        with open(state_path, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, ensure_ascii=False)
    return True


if __name__ == "__main__":
    sys.exit(0 if backfill_from_scraped() else 1)
