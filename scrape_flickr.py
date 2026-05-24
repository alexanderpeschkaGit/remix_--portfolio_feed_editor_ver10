import requests
import re
import os
import json
import sys
from PIL import Image
import imagehash
import time
from image_variants import build_variant_set_from_image

# Ensure UTF-8 for console output to prevent 'charmap' errors on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# ==========================================
# CONFIGURATION
# ==========================================
FLICKR_ALBUM_URL = "https://www.flickr.com/photos/23689211@N04/albums/72157604835171705/"
FLICKR_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "en-US,en;q=0.9"
}
# Speichert JSON im Unterordner 'data/flickr'
OUTPUT_DIR = os.path.join("data", "flickr")

def sanitize_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()

def scrape_flickr():
    print(f"\n--- STARTING FLICKR SCRAPE ---")
    print(f"Fetching album data from {FLICKR_ALBUM_URL}...")
    
    flickr_data = []
    try:
        response = requests.get(FLICKR_ALBUM_URL, headers=FLICKR_HEADERS)
        response.raise_for_status()
        html = response.text
        
        api_key_match = re.search(r'site_key\s*=\s*"([^"]+)"', html)
        if not api_key_match:
            print("Could not find Flickr's internal API key on the page.")
            return flickr_data
            
        api_key = api_key_match.group(1)
        url_parts = FLICKR_ALBUM_URL.rstrip('/').split('/')
        user_id = url_parts[4]
        photoset_id = url_parts[6]
        
        print(f"Flickr API Key found. Fetching all images...")
        
        all_photos = []
        page = 1
        total_pages = 1
        
        while page <= total_pages:
            api_url = f"https://api.flickr.com/services/rest/?method=flickr.photosets.getPhotos&api_key={api_key}&photoset_id={photoset_id}&user_id={user_id}&format=json&nojsoncallback=1&page={page}&per_page=500&extras=description,url_m,url_c,url_l,url_b,url_h,url_k,url_3k,url_4k,url_o"
            
            api_res = requests.get(api_url, headers=FLICKR_HEADERS)
            data = api_res.json()
            
            if data.get('stat') == 'ok':
                photos = data['photoset']['photo']
                all_photos.extend(photos)
                total_pages = data['photoset']['pages']
                print(f"Loaded Flickr page {page}/{total_pages} ({len(photos)} pictures).")
                page += 1
            else:
                print("Error fetching from Flickr API:", data)
                break
                
        print(f"Found a total of {len(all_photos)} Flickr pictures!")
        
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        
        for i, photo in enumerate(all_photos, 1):
            try:
                title = photo.get('title', f"photo_{photo['id']}")
                safe_title = sanitize_filename(title) or "untitled"
                
                desc_obj = photo.get('description', {})
                desc = desc_obj.get('_content', '') if isinstance(desc_obj, dict) else str(desc_obj)
                    
                filename = f"{i:03d}_{safe_title}_{photo['id']}.jpg"
                
                url_1024 = photo.get('url_b') or photo.get('url_l') or photo.get('url_c')
                url_highres = photo.get('url_3k') or photo.get('url_o') or photo.get('url_4k') or photo.get('url_k') or photo.get('url_h') or url_1024
                
                print(f"[Flickr {i}/{len(all_photos)}] Processing: {title}")
                source_url = url_highres or url_1024
                if not source_url:
                    print(f"  -> No source URL found for {filename}")
                    continue

                temp_path = os.path.join(OUTPUT_DIR, f"_tmp_{filename}")
                r = requests.get(source_url, stream=True)
                r.raise_for_status()
                with open(temp_path, 'wb') as f:
                    for chunk in r.iter_content(8192):
                        f.write(chunk)

                variant_data = build_variant_set_from_image(temp_path, "flickr", f"{i:03d}_{safe_title}_{photo['id']}")
                urls = variant_data["urls"]
                image_width = variant_data.get("width", 0)
                image_height = variant_data.get("height", 0)
                
                # Generate pHash
                phash_str = ""
                thumb_path = variant_data["local_paths"].get("image_1k") or variant_data["local_paths"].get("image_thumb")
                if thumb_path and os.path.exists(thumb_path):
                    try:
                        with Image.open(thumb_path) as img:
                            phash = imagehash.phash(img)
                            phash_str = str(phash)
                    except Exception as ph_err:
                        print(f"Error generating pHash for {filename}: {ph_err}")

                try:
                    os.remove(temp_path)
                except OSError:
                    pass

                flickr_data.append({
                    'id': photo['id'],
                    'title': title,
                    'desc': desc,
                    'description': desc,
                    'link': f"https://www.flickr.com/photos/{user_id}/{photo['id']}/",
                    'image': urls.get('image'),
                    'image_thumb': urls.get('image_thumb', ''),
                    'image_1k': urls.get('image_1k', ''),
                    'image_2k': urls.get('image_2k', ''),
                    'image_large': urls.get('image_large', ''),
                    'image_3k': urls.get('image_3k', ''),
                    'image_original': urls.get('image_original', ''),
                    'image_width': image_width,
                    'image_height': image_height,
                    'media_list': [{
                        'type': 'image',
                        'link': f"https://www.flickr.com/photos/{user_id}/{photo['id']}/",
                        **urls
                    }],
                    'missing_variants': variant_data['missing_variants'],
                    'phash': phash_str
                })
                
                # Polite delay to avoid "Abuse" flags (1 second)
                time.sleep(1)
                
            except Exception as photo_err:
                print(f"Error processing Flickr photo {i}: {photo_err}")
                continue
            
    except Exception as e:
        print(f"An error occurred during Flickr scrape: {e}")
        
    # Speichere Metadaten als JSON für das Frontend
    with open(os.path.join(OUTPUT_DIR, "flickr_data.json"), "w", encoding="utf-8") as f:
        json.dump(flickr_data, f, indent=2)
        
    return flickr_data

if __name__ == "__main__":
    scrape_flickr()
    import sys
    if sys.stdin.isatty():
        input("Process finished. Press Enter to close...")
    else:
        print("Process finished.")
