#!/usr/bin/env python3
"""
Backfill missing image dimensions in state.json
Reads image files and extracts width/height metadata
"""
import json
import os
import sys
import glob
from PIL import Image
from pathlib import Path

# Ensure UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def get_image_dimensions(image_path):
    """Extract dimensions from an image file"""
    try:
        if not os.path.exists(image_path):
            return None
        with Image.open(image_path) as img:
            return img.width, img.height
    except Exception as e:
        print(f"  ❌ Error reading {image_path}: {e}")
        return None

def try_get_dimensions_from_item(item):
    """Try to extract dimensions from an item's images"""
    # Check all potential image paths in order of preference
    image_fields = ['image_1k', 'image_2k', 'image_3k', 'image_thumb', 'image', 'image_original']
    
    # First try merged media
    if item.get('mergedMedia'):
        for media in item['mergedMedia']:
            for field in image_fields:
                if field in media and media[field]:
                    path = media[field]
                    # Handle absolute paths
                    if path.startswith('/'):
                        path = path.lstrip('/')
                    # Skip remote URLs (R2, Instagram, Flickr)
                    if path.startswith('http'):
                        continue
                    dims = get_image_dimensions(path)
                    if dims:
                        return dims
    
    # Then try top-level fields
    for field in image_fields:
        if field in item and item[field]:
            path = item[field]
            # Handle absolute paths
            if path.startswith('/'):
                path = path.lstrip('/')
            # Skip remote URLs (R2, Instagram, Flickr)
            if path.startswith('http'):
                continue
            dims = get_image_dimensions(path)
            if dims:
                return dims
    
    # Last resort: look for any files matching the item ID in data_v2
    item_id = item.get('id', '')
    if item_id:
        for variant_dir in ['1k', '2k', 'thumbs400', '3k', 'originals']:
            pattern_path = f'data_v2/uploads/{variant_dir}/{item_id}*'
            try:
                import glob
                matches = glob.glob(pattern_path)
                if matches:
                    dims = get_image_dimensions(matches[0])
                    if dims:
                        return dims
            except:
                pass
    
    return None

def backfill_dimensions():
    """Main backfill function"""
    print("\n" + "="*60)
    print("BACKFILLING IMAGE DIMENSIONS")
    print("="*60 + "\n")
    
    state_path = 'data/state.json'
    
    # Load state
    try:
        with open(state_path, 'r', encoding='utf-8') as f:
            state = json.load(f)
    except Exception as e:
        print(f"❌ Error reading state.json: {e}")
        return False
    
    items = state.get('items', [])
    total = len(items)
    updated = 0
    skipped = 0
    failed = 0
    
    print(f"Processing {total} items...\n")
    
    for idx, item in enumerate(items, 1):
        item_id = item.get('id', 'unknown')
        
        # Check if already has dimensions
        has_dims = False
        if item.get('image_width') and item.get('image_height'):
            has_dims = True
        
        if item.get('mergedMedia'):
            for media in item['mergedMedia']:
                if media.get('image_width') and media.get('image_height'):
                    has_dims = True
                    break
        
        if has_dims:
            skipped += 1
            continue
        
        # Try to extract dimensions
        print(f"[{idx}/{total}] {item_id}...", end=" ")
        dims = try_get_dimensions_from_item(item)
        
        if dims:
            width, height = dims
            
            # Update primary fields
            item['image_width'] = width
            item['image_height'] = height
            
            # Update merged media if present
            if item.get('mergedMedia'):
                for media in item['mergedMedia']:
                    if not media.get('image_width'):
                        media['image_width'] = width
                        media['image_height'] = height
            
            print(f"✓ {width}x{height}")
            updated += 1
        else:
            print(f"✗ Could not extract dimensions")
            failed += 1
    
    # Save updated state
    print(f"\n{'='*60}")
    print(f"Results:")
    print(f"  ✓ Updated:  {updated} items")
    print(f"  ⊘ Skipped:  {skipped} items (already had dims)")
    print(f"  ✗ Failed:   {failed} items (could not extract)")
    print(f"{'='*60}\n")
    
    if updated > 0:
        print(f"Saving updated state.json...")
        try:
            with open(state_path, 'w', encoding='utf-8') as f:
                json.dump(state, f, indent=2, ensure_ascii=False)
            print("✓ Saved successfully!")
            return True
        except Exception as e:
            print(f"❌ Error saving state.json: {e}")
            return False
    else:
        print("No updates made.")
        return True

if __name__ == "__main__":
    success = backfill_dimensions()
    sys.exit(0 if success else 1)
