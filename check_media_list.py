import json

with open('data/flickr/flickr_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

if data and data[0].get('media_list'):
    sample_media = data[0]['media_list'][0]
    print(f'Flickr media_list[0] keys: {list(sample_media.keys())}')
    print(f'image_width: {sample_media.get("image_width")}')
    print(f'image_height: {sample_media.get("image_height")}')
    
with open('data/instagram/insta_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

if data and data[0].get('media_list'):
    sample_media = data[0]['media_list'][0]
    print(f'\nInstagram media_list[0] keys: {list(sample_media.keys())}')
    print(f'image_width: {sample_media.get("image_width")}')
    print(f'image_height: {sample_media.get("image_height")}')
