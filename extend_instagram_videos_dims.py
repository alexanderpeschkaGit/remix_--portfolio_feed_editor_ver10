import json
import os
import sys
import subprocess
from datetime import datetime, UTC
from pathlib import Path
from urllib.parse import urlparse, unquote

# Ensure UTF-8 for console output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

STATE_PATH = os.path.join("data", "state.json")
INSTAGRAM_SCRAPE_PATH = os.path.join("data", "instagram", "insta_data.json")

# Instagram Standard Video Dimensions (fallback if ffprobe not available)
INSTAGRAM_VIDEO_WIDTH = 1080
INSTAGRAM_VIDEO_HEIGHT = 1080

def check_ffprobe():
    """Check if ffprobe is installed"""
    try:
        subprocess.run(['ffprobe', '-version'], 
                      stdout=subprocess.PIPE, 
                      stderr=subprocess.PIPE, 
                      timeout=5)
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False

def get_video_dimensions_ffprobe(file_path):
    """Extract video dimensions using ffprobe"""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
             '-show_entries', 'stream=width,height',
             '-of', 'csv=s=x:p=0', file_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10,
            text=True
        )
        
        if result.returncode == 0 and result.stdout.strip():
            dims = result.stdout.strip().split('x')
            if len(dims) == 2:
                try:
                    width = int(dims[0])
                    height = int(dims[1])
                    if width > 0 and height > 0:
                        return width, height
                except ValueError:
                    pass
    except Exception as e:
        pass
    
    return None, None

def get_video_dimensions(url_or_path):
    """Try to get video dimensions from a local file path or reachable URL."""
    if not url_or_path:
        return None, None

    candidates = []

    # Direct local file path
    candidates.append(url_or_path)

    # Relative path like /data/instagram/... or a public URL path
    if url_or_path.startswith('/'):
        candidates.append(url_or_path.lstrip('/'))

    # If we got an absolute URL, try the local mirror path first.
    parsed = urlparse(url_or_path)
    if parsed.scheme and parsed.netloc:
        local_from_url = unquote(parsed.path.lstrip('/'))
        if local_from_url:
            candidates.append(local_from_url)

    # Try local files first.
    for candidate in candidates:
        local_path = candidate.replace('/', os.sep)
        if os.path.isfile(local_path):
            width, height = get_video_dimensions_ffprobe(local_path)
            if width and height:
                return width, height

    # Finally, try probing the URL itself if ffprobe can reach it.
    if parsed.scheme in ('http', 'https'):
        width, height = get_video_dimensions_ffprobe(url_or_path)
        if width and height:
            return width, height

    return None, None

def is_video_url(url):
    """Check if URL points to a video file"""
    if not url:
        return False
    url_lower = url.lower()
    return url_lower.endswith(('.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv'))

def unique_candidates(values):
    """Return non-empty values in first-seen order."""
    seen = set()
    result = []
    for value in values:
        if not value:
            continue
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result

def load_instagram_scrape_lookup():
    """Load local Instagram scrape metadata as a fallback source lookup."""
    if not os.path.exists(INSTAGRAM_SCRAPE_PATH):
        return {}

    try:
        with open(INSTAGRAM_SCRAPE_PATH, 'r', encoding='utf-8') as f:
            scraped = json.load(f)
    except Exception:
        return {}

    lookup = {}
    if not isinstance(scraped, list):
        return lookup

    for entry in scraped:
        if not isinstance(entry, dict):
            continue

        candidates = []
        for key in ('image', 'image_large', 'image_original', 'video', 'video_large', 'url', 'link'):
            value = entry.get(key)
            if value:
                candidates.append(value)

        for media in entry.get('media_list', []) or []:
            if isinstance(media, str):
                candidates.append(media)
            elif isinstance(media, dict):
                for key in ('image', 'image_large', 'image_original', 'video', 'video_large', 'url', 'link'):
                    value = media.get(key)
                    if value:
                        candidates.append(value)

        lookup_values = unique_candidates(candidates)
        if not lookup_values:
            continue

        for key in (entry.get('id'), entry.get('link')):
            if not key:
                continue
            lookup[str(key)] = lookup_values

    return lookup

def collect_video_sources(item, scrape_lookup=None):
    """Gather the best candidate video sources for an item."""
    candidates = [
        item.get('video'),
        item.get('video_large'),
        item.get('image'),
        item.get('image_large'),
        item.get('image_original'),
        item.get('url'),
        item.get('link'),
    ]

    if scrape_lookup:
        candidates.extend(scrape_lookup.get(str(item.get('id', '')), []))
        candidates.extend(scrape_lookup.get(str(item.get('link', '')), []))

    return unique_candidates(candidates)

def is_instagram_video(item):
    """Check if item is an Instagram video"""
    source = item.get('source', '').lower()
    item_type = item.get('type', '').lower()
    
    if source != 'instagram':
        return False

    # Instagram video posts may store only the post URL instead of a direct video file
    if item_type == 'video':
        return True

    if item_type == 'image':
        return any(is_video_url(candidate) for candidate in collect_video_sources(item))

    return False

def extend_instagram_video_dims():
    """Add dimensions to Instagram videos from Cloudflare"""
    if not os.path.exists(STATE_PATH):
        print(f"[ERROR] {STATE_PATH} not found!")
        return False
    
    try:
        with open(STATE_PATH, 'r', encoding='utf-8') as f:
            state = json.load(f)
    except json.JSONDecodeError as e:
        print(f"[ERROR] Failed to parse {STATE_PATH}: {e}")
        return False
    
    if not isinstance(state, dict) or 'items' not in state:
        print(f"[ERROR] Invalid state.json structure (expected 'items' key)")
        return False
    
    items = state.get('items', [])
    scrape_lookup = load_instagram_scrape_lookup()
    
    print(f"\n--- EXTENDING INSTAGRAM VIDEO DIMENSIONS ---")
    
    # Check for ffprobe
    ffprobe_available = check_ffprobe()
    if ffprobe_available:
        print("✓ ffprobe detected (will extract actual video dimensions)")
    else:
        print("⚠ ffprobe not found (will use Instagram standard 1080×1080)")
        print("  To enable dimension extraction, install FFmpeg:")
        print("  Windows: choco install ffmpeg")
        print("  Or download from: https://ffmpeg.org/download.html\n")
    
    updated_count = 0
    skipped_count = 0
    total_instagram_videos = 0
    
    print(f"Processing {len(items)} posts...\n")
    
    for item in items:
        if is_instagram_video(item):
            total_instagram_videos += 1
            
            # Check top-level
            if not item.get('image_width') or not item.get('image_height'):
                # Try to get actual dimensions from video file
                video_sources = collect_video_sources(item, scrape_lookup)
                width, height = None, None
                
                if ffprobe_available:
                    for video_url in video_sources:
                        width, height = get_video_dimensions(video_url)
                        if width and height:
                            break
                
                # Use ffprobe result or fallback to Instagram standard
                if width and height:
                    item['image_width'] = width
                    item['image_height'] = height
                    print(f"  ✓ {item.get('title', 'Instagram Video')}: {width}×{height} (extracted)")
                else:
                    item['image_width'] = INSTAGRAM_VIDEO_WIDTH
                    item['image_height'] = INSTAGRAM_VIDEO_HEIGHT
                    print(f"  ✓ {item.get('title', 'Instagram Video')}: {INSTAGRAM_VIDEO_WIDTH}×{INSTAGRAM_VIDEO_HEIGHT} (standard)")
                
                updated_count += 1
            else:
                skipped_count += 1
        
        # Check mergedMedia items
        if item.get('mergedMedia') and isinstance(item['mergedMedia'], list):
            for idx, media in enumerate(item['mergedMedia']):
                media_sources = collect_video_sources(media, scrape_lookup)
                if media.get('type', '').lower() == 'video' or any(is_video_url(candidate) for candidate in media_sources):
                    if not media.get('image_width') or not media.get('image_height'):
                        width, height = None, None

                        if ffprobe_available:
                            for candidate in media_sources:
                                width, height = get_video_dimensions(candidate)
                                if width and height:
                                    break

                        if width and height:
                            media['image_width'] = width
                            media['image_height'] = height
                        else:
                            media['image_width'] = INSTAGRAM_VIDEO_WIDTH
                            media['image_height'] = INSTAGRAM_VIDEO_HEIGHT

                        updated_count += 1
                    else:
                        skipped_count += 1
    
    # Save updated state
    try:
        with open(STATE_PATH, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
        print(f"\n✅ SUCCESS!")
        print(f"   Total Instagram videos found: {total_instagram_videos}")
        print(f"   Updated with dimensions: {updated_count}")
        print(f"   Already had dimensions: {skipped_count}")
        print(f"   Saved to: {STATE_PATH}")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to save {STATE_PATH}: {e}")
        return False

if __name__ == "__main__":
    success = extend_instagram_video_dims()
    if not success:
        sys.exit(1)
    
    # Pause if running in interactive terminal
    if sys.stdin.isatty():
        input("\nProcess finished. Press Enter to close...")
    else:
        print("\nProcess finished.")
