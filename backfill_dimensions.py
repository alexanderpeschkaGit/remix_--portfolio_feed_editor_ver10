#!/usr/bin/env python3
"""Backfill missing dimensions by decoding each media item independently."""
import json
import os
import sys
from urllib.parse import unquote, urlparse

from PIL import Image, ImageOps

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

IMAGE_FIELDS = ["image_original", "image_3k", "image_2k", "image_large", "image_1k", "image_thumb", "image"]


def local_image_path(value):
    if not isinstance(value, str) or not value.strip():
        return None
    clean = value.split("?", 1)[0]
    if clean.startswith(("http://", "https://")):
        pathname = unquote(urlparse(clean).path).lstrip("/")
        if pathname.startswith("v2/data/"):
            clean = "data_v2/" + pathname[len("v2/data/"):]
        elif pathname.startswith(("data/", "data_v2/", "originals/")):
            clean = pathname
        else:
            return None
    else:
        clean = unquote(clean).lstrip("/")
    return clean.replace("/", os.sep)


def get_image_dimensions(image_path):
    try:
        if not image_path or not os.path.isfile(image_path):
            return None
        with Image.open(image_path) as image:
            image = ImageOps.exif_transpose(image)
            image.verify()
            return image.width, image.height
    except Exception as error:
        print(f"  Could not decode {image_path}: {error}")
        return None


def try_get_dimensions_from_media(media):
    """Never inspect a sibling carousel item while resolving this media."""
    for field in IMAGE_FIELDS:
        dimensions = get_image_dimensions(local_image_path(media.get(field)))
        if dimensions:
            return dimensions
    return None


def backfill_dimensions(state_path="data/state.json"):
    try:
        with open(state_path, "r", encoding="utf-8") as handle:
            state = json.load(handle)
    except Exception as error:
        print(f"Could not read {state_path}: {error}")
        return False

    updated_media = 0
    unresolved_media = 0
    for item in state.get("items", []):
        media_list = item.get("mergedMedia") or [item]
        for media in media_list:
            if media.get("image_width") and media.get("image_height"):
                continue
            dimensions = try_get_dimensions_from_media(media)
            if not dimensions:
                unresolved_media += 1
                continue
            media["image_width"], media["image_height"] = dimensions
            updated_media += 1

        # Top-level fields are only a reference to carousel item 1.
        if item.get("mergedMedia") and media_list:
            primary = media_list[0]
            if primary.get("image_width") and primary.get("image_height"):
                item["image_width"] = primary["image_width"]
                item["image_height"] = primary["image_height"]

    print(f"Updated {updated_media} media; unresolved {unresolved_media}.")
    if updated_media:
        with open(state_path, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, ensure_ascii=False)
    return True


if __name__ == "__main__":
    sys.exit(0 if backfill_dimensions() else 1)
