import json

with open('data/state.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

missing = []
for item in data.get('items', []):
    has_dims = False
    
    if item.get('image_width') and item.get('image_height'):
        has_dims = True
    
    if item.get('mergedMedia'):
        for media in item.get('mergedMedia', []):
            if media.get('image_width') and media.get('image_height'):
                has_dims = True
                break
    
    if not has_dims:
        missing.append(item.get('id', 'unknown'))

# Analyze patterns
custom = [x for x in missing if x.startswith('custom-')]
flickr = [x for x in missing if x.isdigit()]
instagram = [x for x in missing if not x.startswith('custom-') and not x.isdigit()]

print(f'Total missing: {len(missing)}')
print(f'  Custom uploads: {len(custom)}')
print(f'  Flickr IDs (numeric): {len(flickr)}')
print(f'  Instagram/Other: {len(instagram)}')
print()
print(f'Sample custom: {custom[:3] if custom else "none"}')
print(f'Sample flickr: {flickr[:3] if flickr else "none"}')
print(f'Sample instagram: {instagram[:3] if instagram else "none"}')
