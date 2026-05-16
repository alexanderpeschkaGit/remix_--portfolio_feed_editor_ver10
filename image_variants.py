import os
import shutil
from PIL import Image

BASE_DIR = "data_v2"

VARIANT_SPECS = [
    {"field": "image_thumb", "dir": "thumbs400", "suffix": "thumb", "max_side": 400, "quality": 74, "always": True},
    {"field": "image_1k", "dir": "1k", "suffix": "1k", "max_side": 1024, "quality": 78, "always": False},
    {"field": "image_2k", "dir": "2k", "suffix": "2k", "max_side": 2048, "quality": 80, "always": False},
    {"field": "image_3k", "dir": "3k", "suffix": "3k", "max_side": 3072, "quality": 82, "always": False},
]


def _url_for(group: str, subdir: str, filename: str) -> str:
    return f"/data_v2/{group}/{subdir}/{filename}".replace("\\", "/")


def ensure_group_dirs(group: str) -> dict:
    group_dir = os.path.join(BASE_DIR, group)
    os.makedirs(group_dir, exist_ok=True)
    os.makedirs(os.path.join(group_dir, "originals"), exist_ok=True)
    for spec in VARIANT_SPECS:
        os.makedirs(os.path.join(group_dir, spec["dir"]), exist_ok=True)
    return {
        "group_dir": group_dir,
        "originals": os.path.join(group_dir, "originals"),
        **{spec["dir"]: os.path.join(group_dir, spec["dir"]) for spec in VARIANT_SPECS},
    }


def _save_variant(image: Image.Image, target_path: str, max_side: int, quality: int) -> None:
    variant = image.copy()
    variant.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    if variant.mode not in ("RGB", "L"):
        variant = variant.convert("RGB")
    elif variant.mode == "L":
        variant = variant.convert("RGB")
    variant.save(target_path, quality=quality, optimize=True)


def build_variant_set_from_image(source_path: str, group: str, base_name: str) -> dict:
    dirs = ensure_group_dirs(group)
    source_ext = os.path.splitext(source_path)[1] or ".jpg"
    original_filename = f"{base_name}_original{source_ext.lower()}"
    original_path = os.path.join(dirs["originals"], original_filename)

    if os.path.abspath(source_path) != os.path.abspath(original_path):
        shutil.copy2(source_path, original_path)

    urls = {
        "image_original": _url_for(group, "originals", original_filename)
    }
    local_paths = {
        "image_original": original_path.replace("\\", "/")
    }
    missing_variants = []

    with Image.open(source_path) as image:
        max_side = max(image.width, image.height)
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        elif image.mode == "L":
            image = image.convert("RGB")

        for spec in VARIANT_SPECS:
            if not spec["always"] and max_side < spec["max_side"]:
                missing_variants.append(spec["field"])
                continue

            filename = f"{base_name}_{spec['suffix']}.jpg"
            target_path = os.path.join(dirs[spec["dir"]], filename)
            _save_variant(image, target_path, spec["max_side"], spec["quality"])
            urls[spec["field"]] = _url_for(group, spec["dir"], filename)
            local_paths[spec["field"]] = target_path.replace("\\", "/")

    urls["image"] = urls.get("image_thumb", "")
    urls["image_large"] = urls.get("image_2k") or urls.get("image_3k") or urls.get("image_1k") or urls.get("image_thumb", "")
    urls["image_3k"] = urls.get("image_3k", "")

    return {
        "urls": urls,
        "local_paths": local_paths,
        "missing_variants": missing_variants,
        "source_path": source_path.replace("\\", "/"),
        "original_path": original_path.replace("\\", "/"),
    }


def build_media_payload_from_image(source_path: str, group: str, base_name: str, link: str = "") -> dict:
    result = build_variant_set_from_image(source_path, group, base_name)
    urls = result["urls"]
    return {
        "type": "image",
        "link": link,
        **urls,
    }
