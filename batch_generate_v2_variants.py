import json
import os
from datetime import datetime, UTC
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse, unquote

from image_variants import build_variant_set_from_image

STATE_PATH = os.path.join("data", "state.json")
CONNECT_PATH = "Connect_front_back.md"
SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}


def infer_group_from_url(url: str) -> str:
    if "/data_v2/uploads/" in url or "/data/uploads/" in url:
        return "uploads"
    if "/data_v2/flickr/" in url or "/data/flickr/" in url:
        return "flickr"
    if "/data_v2/instagram/" in url or "/data/instagram/" in url:
        return "instagram"
    if "/data_v2/highres/" in url or "/data/highres/" in url or "/originals/" in url:
        return "highres"
    if "/data_v2/previews/" in url or "/data/previews/" in url:
        return "previews"
    return "uploads"


def url_to_local_path(url: str) -> Optional[str]:
    if not url:
        return None
    clean = url.split("?")[0]
    if clean.startswith("http://") or clean.startswith("https://"):
        clean = urlparse(clean).path
    clean = unquote(clean)
    if clean.startswith("/data_v2/"):
        return clean.lstrip("/").replace("/", os.sep)
    if clean.startswith("/data/"):
        return clean.lstrip("/").replace("/", os.sep)
    if clean.startswith("/originals/"):
        return clean.lstrip("/").replace("/", os.sep)
    return None


def choose_source(media: Dict[str, Any]) -> Tuple[Optional[str], List[str]]:
    checked = []
    for field in ["image_original", "image_3k", "image_2k", "image_large", "image_1k", "image_thumb", "image"]:
        value = media.get(field)
        if not value:
            continue
        checked.append(field)
        local_path = url_to_local_path(value)
        if local_path and os.path.isfile(local_path):
            return local_path, checked
    return None, checked


def merge_variant_urls(media: Dict[str, Any], generated: Dict[str, str]) -> Dict[str, Any]:
    out = dict(media)
    for field in ["image_thumb", "image_1k", "image_2k", "image_3k", "image_original"]:
        if generated.get(field):
            out[field] = generated[field]
    if generated.get("image"):
        out["image"] = generated["image"]
    if generated.get("image_large"):
        out["image_large"] = generated["image_large"]
    return out


def is_supported_image_source(source_path: str) -> bool:
    return os.path.splitext(source_path)[1].lower() in SUPPORTED_IMAGE_EXTENSIONS


def append_batch_report(lines: List[str]) -> None:
    timestamp = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    section = ["", "## Batch Report", f"- Timestamp: {timestamp}"]
    if lines:
        section.extend([f"- {line}" for line in lines])
    else:
        section.append("- Keine fehlenden oder defekten Quellen im letzten Lauf protokolliert.")

    existing = ""
    if os.path.exists(CONNECT_PATH):
        with open(CONNECT_PATH, "r", encoding="utf-8") as f:
            existing = f.read().rstrip() + "\n"

    with open(CONNECT_PATH, "w", encoding="utf-8") as f:
        f.write(existing + "\n".join(section) + "\n")


def process_media(media: Dict[str, Any], base_name: str, fallback_group: str, report_lines: List[str]) -> Dict[str, Any]:
    source_path, checked_fields = choose_source(media)
    if not source_path:
        report_lines.append(f"{base_name}: keine lokale Quelle gefunden, geprueft {', '.join(checked_fields) or 'keine Felder'}")
        return media
    if not is_supported_image_source(source_path):
        report_lines.append(f"{base_name}: Quelle ist kein Bild und wurde uebersprungen ({os.path.basename(source_path)})")
        return media

    group = infer_group_from_url(media.get("image_original") or media.get("image") or media.get("image_thumb") or "")
    if not group:
        group = fallback_group

    result = build_variant_set_from_image(source_path, group, base_name)
    if result["missing_variants"]:
        report_lines.append(f"{base_name}: Quelle zu klein fuer {', '.join(result['missing_variants'])}")
    return merge_variant_urls(media, result["urls"])


def main() -> None:
    if not os.path.exists(STATE_PATH):
        raise FileNotFoundError(f"{STATE_PATH} wurde nicht gefunden")

    with open(STATE_PATH, "r", encoding="utf-8") as f:
        state = json.load(f)

    report_lines: List[str] = []
    updated_items: List[Dict[str, Any]] = []

    for item in state.get("items", []):
        group = infer_group_from_url(item.get("image_original") or item.get("image") or item.get("image_thumb") or "")

        merged_media = item.get("mergedMedia") or []
        if merged_media:
            next_media = []
            for idx, media in enumerate(merged_media):
                if media.get("type") == "youtube":
                    next_media.append(media)
                    continue
                next_media.append(process_media(media, f"{item.get('id', 'item')}_{idx + 1:02d}", group, report_lines))
            item["mergedMedia"] = next_media
            primary = next_media[0] if next_media else None
            if primary:
                item = merge_variant_urls(item, primary)
        else:
            item = process_media(item, str(item.get("id", "item")), group, report_lines)

        updated_items.append(item)

    state["items"] = updated_items
    state["lastUpdated"] = datetime.now(UTC).isoformat().replace("+00:00", "Z")

    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

    append_batch_report(report_lines)
    print(f"Batch fertig. Report-Eintraege: {len(report_lines)}")


if __name__ == "__main__":
    main()
