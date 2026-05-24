import json

with open('data/flickr/flickr_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f'Flickr items: {len(data)}')
if data:
    sample = data[0]
    print(f'Sample item keys: {list(sample.keys())}')
    print(f'image_width: {sample.get("image_width")}')
    print(f'image_height: {sample.get("image_height")}')
    
with open('data/instagram/insta_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f'\nInstagram items: {len(data)}')
if data:
    sample = data[0]
    print(f'Sample item keys: {list(sample.keys())}')
    print(f'image_width: {sample.get("image_width")}')
    print(f'image_height: {sample.get("image_height")}')
