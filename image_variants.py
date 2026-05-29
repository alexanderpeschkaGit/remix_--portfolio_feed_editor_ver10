import os
import shutil
import subprocess
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


def _is_video_file(source_path: str) -> bool:
    ext = os.path.splitext(source_path)[1].lower()
    return ext in {".mp4", ".webm", ".mov", ".avi", ".mkv", ".flv"}


def _probe_video_dimensions(source_path: str) -> tuple[int, int]:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=s=x:p=0",
                source_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10,
            text=True,
        )
        if result.returncode == 0 and result.stdout.strip():
            dims = result.stdout.strip().split("x")
            if len(dims) == 2:
                width = int(dims[0])
                height = int(dims[1])
                if width > 0 and height > 0:
                    return width, height
    except Exception:
        pass
    return 0, 0


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

    width = 0
    height = 0
    with Image.open(source_path) as image:
        width = image.width
        height = image.height
        max_side = max(width, height)
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
        "width": width,
        "height": height,
    }


def build_media_payload_from_file(source_path: str, group: str, base_name: str, link: str = "") -> dict:
    if _is_video_file(source_path):
        width, height = _probe_video_dimensions(source_path)
        normalized_path = source_path.replace("\\", "/")
        return {
            "type": "video",
            "link": link,
            "image": normalized_path,
            "video": normalized_path,
            "video_large": normalized_path,
            "image_large": normalized_path,
            "image_thumb": normalized_path,
            "image_1k": normalized_path,
            "image_2k": normalized_path,
            "image_3k": normalized_path,
            "image_original": normalized_path,
            "image_width": width,
            "image_height": height,
            "missing_variants": [],
        }

    return build_media_payload_from_image(source_path, group, base_name, link)


def build_media_payload_from_image(source_path: str, group: str, base_name: str, link: str = "") -> dict:
    result = build_variant_set_from_image(source_path, group, base_name)
    urls = result["urls"]
    return {
        "type": "image",
        "link": link,
        "image_width": result.get("width", 0),
        "image_height": result.get("height", 0),
        **urls,
    }
