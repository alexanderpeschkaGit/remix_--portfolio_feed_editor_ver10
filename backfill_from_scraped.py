#!/usr/bin/env python3
"""
Enhanced backfill: Fill in remaining dimensions from scraped data files
"""
import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def backfill_from_scraped():
    """Load dimensions from scraped data files"""
    print("\n" + "="*60)
    print("PHASE 2: BACKFILL FROM SCRAPED DATA")
    print("="*60 + "\n")
    
    # Load scraped data
    flickr_data = {}
    insta_data = {}
    
    try:
        with open('data/flickr/flickr_data.json', 'r', encoding='utf-8') as f:
            flickr_list = json.load(f)
            for item in flickr_list:
                item_id = str(item.get('id', ''))
                if item.get('image_width') and item.get('image_height'):
                    flickr_data[item_id] = {
                        'width': item['image_width'],
                        'height': item['image_height']
                    }
        print(f"✓ Loaded {len(flickr_data)} Flickr items with dimensions")
    except Exception as e:
        print(f"✗ Error loading Flickr data: {e}")
    
    try:
        with open('data/instagram/insta_data.json', 'r', encoding='utf-8') as f:
            insta_list = json.load(f)
            for item in insta_list:
                item_id = str(item.get('id', ''))
                if item.get('image_width') and item.get('image_height'):
                    insta_data[item_id] = {
                        'width': item['image_width'],
                        'height': item['image_height']
                    }
        print(f"✓ Loaded {len(insta_data)} Instagram items with dimensions")
    except Exception as e:
        print(f"✗ Error loading Instagram data: {e}")
    
    # Load state and update
    try:
        with open('data/state.json', 'r', encoding='utf-8') as f:
            state = json.load(f)
    except Exception as e:
        print(f"✗ Error reading state.json: {e}")
        return False
    
    items = state.get('items', [])
    updated = 0
    skipped = 0
    
    print(f"\nProcessing {len(items)} items...\n")
    
    for idx, item in enumerate(items, 1):
        item_id = str(item.get('id', ''))
        
        # Skip if already has dimensions
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
        
        # Try to find in scraped data
        dims = None
        source = None
        
        if item_id in flickr_data:
            dims = flickr_data[item_id]
            source = 'flickr'
        elif item_id in insta_data:
            dims = insta_data[item_id]
            source = 'instagram'
        
        if dims:
            print(f"[{idx}/{len(items)}] {item_id}... ✓ {dims['width']}x{dims['height']} ({source})")
            
            # Update item
            item['image_width'] = dims['width']
            item['image_height'] = dims['height']
            
            # Update merged media
            if item.get('mergedMedia'):
                for media in item['mergedMedia']:
                    if not media.get('image_width'):
                        media['image_width'] = dims['width']
                        media['image_height'] = dims['height']
            
            updated += 1
        else:
            # This is likely a custom-created item with missing images
            pass
    
    print(f"\n{'='*60}")
    print(f"Results:")
    print(f"  ✓ Updated:  {updated} items from scraped data")
    print(f"  ⊘ Skipped:  {skipped} items (already had dims)")
    print(f"{'='*60}\n")
    
    if updated > 0:
        print(f"Saving updated state.json...")
        try:
            with open('data/state.json', 'w', encoding='utf-8') as f:
                json.dump(state, f, indent=2, ensure_ascii=False)
            print("✓ Saved successfully!")
            return True
        except Exception as e:
            print(f"✗ Error saving: {e}")
            return False
    else:
        print("No updates made.")
        return True

if __name__ == "__main__":
    success = backfill_from_scraped()
    sys.exit(0 if success else 1)
