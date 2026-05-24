import json
import os
import sys
from datetime import datetime, UTC

# Ensure UTF-8 for console output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

STATE_PATH = os.path.join("data", "state.json")

# YouTube Standard Dimensions (most common)
YOUTUBE_WIDTH = 1280
YOUTUBE_HEIGHT = 720

def extend_youtube_dims():
    """Add standard YouTube dimensions (1280×720) to all YouTube posts and mergedMedia items"""
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
    updated_count = 0
    total_youtube_items = 0
    total_youtube_merged = 0
    
    print(f"\n--- EXTENDING YOUTUBE DIMENSIONS ---")
    print(f"Processing {len(items)} posts...")
    
    for item in items:
        # Top-level YouTube check
        if item.get('type') == 'youtube' or item.get('youtubeId'):
            total_youtube_items += 1
            # Only add if not already present
            if not item.get('image_width') or not item.get('image_height'):
                item['image_width'] = YOUTUBE_WIDTH
                item['image_height'] = YOUTUBE_HEIGHT
                updated_count += 1
                print(f"  ✓ {item.get('title', 'YouTube Video')}: added 1280×720")
        
        # Check mergedMedia items
        if item.get('mergedMedia') and isinstance(item['mergedMedia'], list):
            for media in item['mergedMedia']:
                if media.get('type') == 'youtube' or media.get('youtubeId'):
                    total_youtube_merged += 1
                    if not media.get('image_width') or not media.get('image_height'):
                        media['image_width'] = YOUTUBE_WIDTH
                        media['image_height'] = YOUTUBE_HEIGHT
                        updated_count += 1
    
    # Save updated state
    try:
        with open(STATE_PATH, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
        print(f"\n✅ SUCCESS!")
        print(f"   Total YouTube top-level posts: {total_youtube_items}")
        print(f"   Total YouTube mergedMedia items: {total_youtube_merged}")
        print(f"   Updated with dimensions: {updated_count}")
        print(f"   Saved to: {STATE_PATH}")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to save {STATE_PATH}: {e}")
        return False

if __name__ == "__main__":
    success = extend_youtube_dims()
    if not success:
        sys.exit(1)
    
    # Pause if running in interactive terminal
    if sys.stdin.isatty():
        input("\nProcess finished. Press Enter to close...")
    else:
        print("\nProcess finished.")
