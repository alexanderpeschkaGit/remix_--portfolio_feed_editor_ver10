import json
import os
import sys
import subprocess
from datetime import datetime, UTC
from pathlib import Path

# Ensure UTF-8 for console output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

STATE_PATH = os.path.join("data", "state.json")

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
    """Try to get video dimensions from local file or URL"""
    # If it's a local path
    if os.path.isfile(url_or_path):
        width, height = get_video_dimensions_ffprobe(url_or_path)
        if width and height:
            return width, height
    
    # If it's a relative path like /data/instagram/...
    if url_or_path.startswith('/'):
        local_path = url_or_path.lstrip('/').replace('/', os.sep)
        if os.path.isfile(local_path):
            width, height = get_video_dimensions_ffprobe(local_path)
            if width and height:
                return width, height
    
    return None, None

def is_video_url(url):
    """Check if URL points to a video file"""
    if not url:
        return False
    url_lower = url.lower()
    return url_lower.endswith(('.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv'))

def is_instagram_video(item):
    """Check if item is an Instagram video"""
    source = item.get('source', '').lower()
    item_type = item.get('type', '').lower()
    
    if source == 'instagram' and (item_type == 'video' or item_type == 'image'):
        # Check if it has video fields
        video_url = (item.get('video') or item.get('video_large') or 
                     item.get('url') or item.get('link') or '')
        return is_video_url(video_url)
    
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
                video_url = item.get('video') or item.get('video_large') or item.get('url') or ''
                width, height = None, None
                
                if ffprobe_available and video_url:
                    width, height = get_video_dimensions(video_url)
                
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
                media_type = media.get('type', '').lower()
                
                # Check if it's a video
                if is_video_url(media.get('video') or media.get('video_large') or media.get('url') or ''):
                    if not media.get('image_width') or not media.get('image_height'):
                        video_url = media.get('video') or media.get('video_large') or media.get('url') or ''
                        width, height = None, None
                        
                        if ffprobe_available and video_url:
                            width, height = get_video_dimensions(video_url)
                        
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
