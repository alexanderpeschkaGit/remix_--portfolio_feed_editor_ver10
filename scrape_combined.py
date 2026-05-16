import sys
import os
import json
import re
import time
import glob
from PIL import Image
import imagehash
from image_variants import build_media_payload_from_image, build_variant_set_from_image

# Ensure UTF-8 for console output to prevent 'charmap' errors on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

try:
    import requests
except ImportError:
    print("\n[ERROR] Die Python-Bibliothek 'requests' fehlt.")
    print("Bitte installiere sie mit folgendem Befehl:")
    print("pip install requests")
    sys.exit(1)

try:
    import instaloader
except ImportError:
    print("\n[ERROR] Die Python-Bibliothek 'instaloader' fehlt.")
    print("Bitte installiere sie mit folgendem Befehl:")
    print("pip install instaloader")
    sys.exit(1)

import html as html_lib

# ==========================================
# CONFIGURATION
# ==========================================
# Instagram
IG_TARGET_ACCOUNT = "vijay_sikanda"
IG_POST_LIMIT = 100

# Flickr
FLICKR_ALBUM_URL = "https://www.flickr.com/photos/23689211@N04/albums/72157604835171705/"
FLICKR_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "en-US,en;q=0.9"
}

def sanitize_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()

def scrape_instagram():
    print(f"\n--- STARTING INSTAGRAM SCRAPE ---")
    
    # Ensure data directory exists
    output_dir = os.path.join("data", "instagram")
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Initialize with High-Res settings (Kept exactly as requested)
    L = instaloader.Instaloader(
        download_pictures=True, 
        download_videos=True, 
        save_metadata=True, 
        post_metadata_txt_pattern="{caption}",
        dirname_pattern=os.path.join(output_dir, "{target}") # Redirect to data/instagram
    )
    
    insta_data = []
    try:
        print(f"Connecting to Instagram to fetch: {IG_TARGET_ACCOUNT}...")
        profile = instaloader.Profile.from_username(L.context, IG_TARGET_ACCOUNT)

        # 3. Download the posts
        for count, post in enumerate(profile.get_posts(), start=1):
            try:
                if count > IG_POST_LIMIT:
                    print(f"\nReached the limit of {IG_POST_LIMIT}. Stopping Instagram scrape.")
                    break
                    
                print(f"Downloading IG post {count}... (Shortcode: {post.shortcode})")
                sys.stdout.flush()
                L.download_post(post, target=IG_TARGET_ACCOUNT)
                
                # Track the base filename so we can find all images/videos for this post later
                base_filename = post.date_utc.strftime('%Y-%m-%d_%H-%M-%S_UTC')
                
                # Find the main image for the JSON feed
                search_pattern = os.path.join(output_dir, IG_TARGET_ACCOUNT, f"{base_filename}*")
                all_files = glob.glob(search_pattern)
                media_files = sorted([f for f in all_files if f.lower().endswith(('.jpg', '.mp4'))])
                
                image_path = ""
                image_thumb = ""
                image_1k = ""
                image_2k = ""
                image_3k = ""
                image_original = ""
                media_list = []
                phash_str = ""
                if media_files:
                    image_candidates = [mf for mf in media_files if mf.lower().endswith('.jpg')]
                    for idx, mf in enumerate(image_candidates):
                        media_payload = build_media_payload_from_image(
                            mf,
                            "instagram",
                            f"{post.shortcode}_{idx + 1:02d}",
                            f"https://www.instagram.com/p/{post.shortcode}/",
                        )
                        media_payload["missing_variants"] = []
                        media_list.append(media_payload)

                    if media_list:
                        first_media = media_list[0]
                        image_path = first_media.get("image", "")
                        image_thumb = first_media.get("image_thumb", "")
                        image_1k = first_media.get("image_1k", "")
                        image_2k = first_media.get("image_2k", "")
                        image_3k = first_media.get("image_3k", "")
                        image_original = first_media.get("image_original", "")
                        thumb_source = first_media.get("image_1k") or first_media.get("image_thumb")
                        if thumb_source:
                            thumb_path = thumb_source.lstrip("/").replace("/", os.sep)
                            try:
                                with Image.open(thumb_path) as img:
                                    phash_str = str(imagehash.phash(img))
                            except Exception as ph_err:
                                print(f"Error hashing {thumb_path}: {ph_err}")

                # Format for Node.js backend
                insta_data.append({
                    "id": post.shortcode,
                    "title": post.caption[:100] if post.caption else "Instagram Post",
                    "description": post.caption or "",
                    "link": f"https://www.instagram.com/p/{post.shortcode}/",
                    "image": image_path,
                    "image_thumb": image_thumb,
                    "image_1k": image_1k,
                    "image_2k": image_2k,
                    "image_large": image_2k or image_3k or image_1k or image_thumb,
                    "image_3k": image_3k,
                    "image_original": image_original,
                    "media_list": media_list,
                    "missing_variants": [m.get("missing_variants", []) for m in media_list],
                    "phash": phash_str,
                    "timestamp": post.date_utc.isoformat()
                })
                
                # Anti-block pause (2 seconds)
                time.sleep(2) 
            except Exception as post_err:
                print(f"Error processing Instagram post {count}: {post_err}")
                continue
            
        print(f"SUCCESS! Instagram media downloaded to folder: {os.path.join(output_dir, IG_TARGET_ACCOUNT)}")
    except Exception as e:
        print(f"\nAn error occurred during Instagram scrape: {e}")
        print("If it says '401 Unauthorized', you might need to log in.")
        
    # Save JSON for Node.js
    with open(os.path.join(output_dir, "insta_data.json"), "w", encoding="utf-8") as f:
        json.dump(insta_data, f, indent=2)
        
    return insta_data

def scrape_flickr():
    print(f"\n--- STARTING FLICKR SCRAPE ---")
    print(f"Fetching album data from {FLICKR_ALBUM_URL}...")
    
    output_dir = os.path.join("data", "flickr")
    os.makedirs(output_dir, exist_ok=True)
    
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
        
        while True:
            api_url = f"https://api.flickr.com/services/rest/?method=flickr.photosets.getPhotos&api_key={api_key}&photoset_id={photoset_id}&user_id={user_id}&format=json&nojsoncallback=1&page={page}&per_page=500&extras=description,url_m,url_c,url_l,url_b,url_h,url_k,url_3k,url_4k,url_o"
            
            api_res = requests.get(api_url, headers=FLICKR_HEADERS)
            data = api_res.json()
            
            if data.get('stat') == 'ok':
                photos = data['photoset']['photo']
                all_photos.extend(photos)
                total_pages = data['photoset']['pages']
                print(f"Loaded Flickr page {page}/{total_pages} ({len(photos)} pictures).")
                sys.stdout.flush()
                
                if page >= total_pages:
                    break
                page += 1
            else:
                print("Error fetching from Flickr API:", data)
                break
                
        print(f"Found a total of {len(all_photos)} Flickr pictures!")
        
        os.makedirs(output_dir, exist_ok=True)
        
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
                sys.stdout.flush()
                
                source_url = url_highres or url_1024
                if not source_url:
                    print(f"  -> No source URL found for {filename}")
                    continue

                temp_path = os.path.join(output_dir, f"_tmp_{filename}")
                r = requests.get(source_url, stream=True)
                r.raise_for_status()
                with open(temp_path, 'wb') as f:
                    for chunk in r.iter_content(8192):
                        f.write(chunk)

                variant_data = build_variant_set_from_image(temp_path, "flickr", f"{i:03d}_{safe_title}_{photo['id']}")
                urls = variant_data["urls"]
                phash_str = ""
                thumb_path = variant_data["local_paths"].get("image_1k") or variant_data["local_paths"].get("image_thumb")
                if thumb_path and os.path.exists(thumb_path):
                    try:
                        with Image.open(thumb_path) as img:
                            phash_str = str(imagehash.phash(img))
                    except Exception as ph_err:
                        print(f"Error hashing {thumb_path}: {ph_err}")
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
                    
                # Format for Node.js backend
                flickr_data.append({
                    "id": photo['id'],
                    "title": title,
                    "description": desc,
                    "link": f"https://www.flickr.com/photos/{user_id}/{photo['id']}/",
                    "image": urls.get("image", ""),
                    "image_thumb": urls.get("image_thumb", ""),
                    "image_1k": urls.get("image_1k", ""),
                    "image_2k": urls.get("image_2k", ""),
                    "image_large": urls.get("image_large", ""),
                    "image_3k": urls.get("image_3k", ""),
                    "image_original": urls.get("image_original", ""),
                    "media_list": [{
                        "type": "image",
                        "link": f"https://www.flickr.com/photos/{user_id}/{photo['id']}/",
                        **urls
                    }],
                    "missing_variants": variant_data["missing_variants"],
                    "phash": phash_str,
                    "timestamp": "" 
                })
                
                # Polite delay to avoid "Abuse" flags (1 second)
                time.sleep(1)
                
            except Exception as photo_err:
                print(f"Error processing Flickr photo {i}: {photo_err}")
                continue
            
    except Exception as e:
        print(f"An error occurred during Flickr scrape: {e}")
        
    # Save JSON for Node.js
    with open(os.path.join(output_dir, "flickr_data.json"), "w", encoding="utf-8") as f:
        json.dump(flickr_data, f, indent=2)
        
    return flickr_data

def main():
    source = sys.argv[1] if len(sys.argv) > 1 else 'combined'
    ig_account = sys.argv[2] if len(sys.argv) > 2 else 'vijay_sikanda'
    flickr_url = sys.argv[3] if len(sys.argv) > 3 else 'https://www.flickr.com/photos/23689211@N04/albums/72157604835171705/'
    
    global IG_TARGET_ACCOUNT, FLICKR_ALBUM_URL
    IG_TARGET_ACCOUNT = ig_account
    FLICKR_ALBUM_URL = flickr_url
    
    if source == 'instagram':
        scrape_instagram()
    elif source == 'flickr':
        scrape_flickr()
    elif source == 'combined':
        scrape_instagram()
        scrape_flickr()
    else:
        print(f"Unknown source: {source}")
        return

    print("\n" + "="*30)
    print(f"DONE! {source.upper()} data generated for Node.js backend.")
    # Only pause if running in an interactive terminal (TTY)
    if sys.stdin.isatty():
        input("Process finished. Press Enter to close...")
    else:
        print("Process finished.")

if __name__ == "__main__":
    main()
