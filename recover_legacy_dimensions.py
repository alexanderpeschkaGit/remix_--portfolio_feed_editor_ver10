#!/usr/bin/env python3
"""Recover missing legacy dimensions by decoding each media URL independently."""
import json
import sys
import time
from io import BytesIO

import requests
from PIL import Image, ImageOps

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

IMAGE_FIELDS = ["image_original", "image_3k", "image_2k", "image_large", "image_1k", "image_thumb", "image"]
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".tif", ".tiff")


def download_and_get_dimensions(url, timeout=15):
    try:
        if not url.lower().split("?", 1)[0].endswith(IMAGE_EXTENSIONS):
            return None
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").lower()
        if content_type and not content_type.startswith("image/"):
            return None
        with Image.open(BytesIO(response.content)) as image:
            image = ImageOps.exif_transpose(image)
            image.load()
            return image.width, image.height
    except Exception:
        return None


def dimensions_for_media(media):
    for field in IMAGE_FIELDS:
        value = media.get(field)
        if isinstance(value, str) and value.startswith(("http://", "https://")):
            result = download_and_get_dimensions(value)
            if result:
                return result
    return None


def recover_legacy_dimensions(state_path="data/state.json"):
    try:
        with open(state_path, "r", encoding="utf-8") as handle:
            state = json.load(handle)
    except Exception as error:
        print(f"Could not read {state_path}: {error}")
        return False

    updated = 0
    failed = 0
    for item in state.get("items", []):
        media_list = item.get("mergedMedia") or [item]
        for media in media_list:
            if media.get("image_width") and media.get("image_height"):
                continue
            result = dimensions_for_media(media)
            if result:
                media["image_width"], media["image_height"] = result
                updated += 1
            else:
                failed += 1
            time.sleep(0.1)
        if item.get("mergedMedia") and media_list[0].get("image_width") and media_list[0].get("image_height"):
            item["image_width"] = media_list[0]["image_width"]
            item["image_height"] = media_list[0]["image_height"]

    print(f"Updated {updated} media; unresolved {failed}.")
    if updated:
        with open(state_path, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, ensure_ascii=False)
    return True


if __name__ == "__main__":
    sys.exit(0 if recover_legacy_dimensions() else 1)
