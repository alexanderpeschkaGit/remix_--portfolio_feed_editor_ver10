import requests
import re
import os
import json
import sys
from PIL import Image
import imagehash
import time

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
# Speichert Daten im Unterordner 'data/flickr'
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
        
        folder_1024 = os.path.join(OUTPUT_DIR, "flickr_1024")
        folder_3k = os.path.join(OUTPUT_DIR, "flickr_3k")
        os.makedirs(folder_1024, exist_ok=True)
        os.makedirs(folder_3k, exist_ok=True)
        
        for i, photo in enumerate(all_photos, 1):
            try:
                title = photo.get('title', f"photo_{photo['id']}")
                safe_title = sanitize_filename(title) or "untitled"
                
                desc_obj = photo.get('description', {})
                desc = desc_obj.get('_content', '') if isinstance(desc_obj, dict) else str(desc_obj)
                    
                filename = f"{i:03d}_{safe_title}_{photo['id']}.jpg"
                
                url_1024 = photo.get('url_b') or photo.get('url_l') or photo.get('url_c')
                # Prefer 3k directly, otherwise get best highres
                url_highres = photo.get('url_3k') or photo.get('url_o') or photo.get('url_4k') or photo.get('url_k') or photo.get('url_h') or url_1024
                
                print(f"[Flickr {i}/{len(all_photos)}] Processing: {title}")
                
                filepath_1024 = os.path.join(folder_1024, filename)
                if url_1024:
                    if not os.path.exists(filepath_1024):
                        r = requests.get(url_1024, stream=True)
                        with open(filepath_1024, 'wb') as f:
                            for chunk in r.iter_content(8192): f.write(chunk)
                
                if url_highres:
                    filepath_3k = os.path.join(folder_3k, filename)
                    if not os.path.exists(filepath_3k):
                        r = requests.get(url_highres, stream=True)
                        with open(filepath_3k, 'wb') as f:
                            for chunk in r.iter_content(8192): f.write(chunk)
                        
                        # Resize logic: if > 4k, resize to 3k
                        try:
                            with Image.open(filepath_3k) as img:
                                if img.width > 4096 or img.height > 4096:
                                    print(f"  -> Resizing from {img.width}x{img.height} to 3k...")
                                    img.thumbnail((3072, 3072), Image.Resampling.LANCZOS)
                                    img.save(filepath_3k, quality=95, optimize=True)
                        except Exception as res_err:
                            print(f"  -> Error checking/resizing {filename}: {res_err}")
                
                # Generate pHash
                phash_str = ""
                if os.path.exists(filepath_1024):
                    try:
                        with Image.open(filepath_1024) as img:
                            phash = imagehash.phash(img)
                            phash_str = str(phash)
                    except Exception as ph_err:
                        print(f"Error generating pHash for {filename}: {ph_err}")

                flickr_data.append({
                    'id': photo['id'],
                    'title': title,
                    'desc': desc,
                    'img_1024': os.path.join("flickr_1024", filename),
                    'img_3k': os.path.join("flickr_3k", filename),
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
