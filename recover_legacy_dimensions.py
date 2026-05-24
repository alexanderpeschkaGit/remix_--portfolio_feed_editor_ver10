#!/usr/bin/env python3
"""
Recover dimensions for legacy items from remote sources (Cloudflare R2, Instagram, Flickr)
Downloads images temporarily, extracts dimensions, then deletes temp files
"""
import json
import sys
import os
import tempfile
import time
from PIL import Image
from io import BytesIO

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

try:
    import requests
except ImportError:
    print("❌ Error: 'requests' library required")
    print("Install with: pip install requests")
    sys.exit(1)

def download_and_get_dimensions(url, timeout=10):
    """Download image from URL and extract dimensions"""
    try:
        response = requests.get(url, timeout=timeout, verify=False)
        response.raise_for_status()
        
        img = Image.open(BytesIO(response.content))
        return img.width, img.height
    except Exception as e:
        return None

def find_working_url(item):
    """Find a working image URL from item"""
    # Check mergedMedia first
    if item.get('mergedMedia'):
        for media in item['mergedMedia']:
            for field in ['image_1k', 'image_2k', 'image_3k', 'image_thumb']:
                url = media.get(field, '')
                if url and url.startswith('http'):
                    return url
    
    # Check top-level fields
    for field in ['image_1k', 'image_2k', 'image_3k', 'image_thumb', 'image_large']:
        url = item.get(field, '')
        if url and url.startswith('http'):
            return url
    
    return None

def recover_legacy_dimensions():
    """Main recovery function"""
    print("\n" + "="*70)
    print("PHASE 3: RECOVER LEGACY ITEMS FROM REMOTE SOURCES")
    print("="*70 + "\n")
    
    # Load state
    try:
        with open('data/state.json', 'r', encoding='utf-8') as f:
            state = json.load(f)
    except Exception as e:
        print(f"❌ Error reading state.json: {e}")
        return False
    
    items = state.get('items', [])
    
    # Find items without dimensions
    missing_items = []
    for item in items:
        has_dims = False
        if item.get('image_width') and item.get('image_height'):
            has_dims = True
        
        if item.get('mergedMedia'):
            for media in item['mergedMedia']:
                if media.get('image_width') and media.get('image_height'):
                    has_dims = True
                    break
        
        if not has_dims:
            missing_items.append(item)
    
    print(f"Found {len(missing_items)} items to recover\n")
    
    updated = 0
    failed = 0
    skipped = 0
    
    for idx, item in enumerate(missing_items, 1):
        item_id = item.get('id', 'unknown')
        
        # Find working URL
        url = find_working_url(item)
        
        if not url:
            print(f"[{idx}/{len(missing_items)}] {item_id}... ✗ No working URL found")
            failed += 1
            continue
        
        print(f"[{idx}/{len(missing_items)}] {item_id}... ", end="", flush=True)
        
        # Try to download and extract dimensions
        dims = download_and_get_dimensions(url, timeout=15)
        
        if dims:
            width, height = dims
            print(f"✓ {width}x{height}")
            
            # Update item
            item['image_width'] = width
            item['image_height'] = height
            
            # Update merged media
            if item.get('mergedMedia'):
                for media in item['mergedMedia']:
                    if not media.get('image_width'):
                        media['image_width'] = width
                        media['image_height'] = height
            
            updated += 1
        else:
            print(f"✗ Could not download/read")
            failed += 1
        
        # Rate limiting - be respectful to remote servers
        if idx < len(missing_items):
            time.sleep(0.5)
    
    print(f"\n{'='*70}")
    print(f"Results:")
    print(f"  ✓ Updated:  {updated} items from remote sources")
    print(f"  ✗ Failed:   {failed} items (unreachable or corrupted)")
    print(f"{'='*70}\n")
    
    if updated > 0:
        print(f"Saving updated state.json...")
        try:
            with open('data/state.json', 'w', encoding='utf-8') as f:
                json.dump(state, f, indent=2, ensure_ascii=False)
            print("✓ Saved successfully!")
            
            # Final stats
            total = len(items)
            with_dims = 0
            for item in items:
                if item.get('image_width') and item.get('image_height'):
                    with_dims += 1
                elif item.get('mergedMedia'):
                    for media in item['mergedMedia']:
                        if media.get('image_width') and media.get('image_height'):
                            with_dims += 1
                            break
            
            pct = 100 * with_dims // total if total > 0 else 0
            print(f"\n📊 Final Coverage: {with_dims}/{total} ({pct}%)")
            return True
        except Exception as e:
            print(f"❌ Error saving: {e}")
            return False
    else:
        print("No updates made.")
        return True

if __name__ == "__main__":
    success = recover_legacy_dimensions()
    sys.exit(0 if success else 1)
