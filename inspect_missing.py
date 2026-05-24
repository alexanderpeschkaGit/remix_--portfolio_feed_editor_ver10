import json

with open('data/state.json', 'r', encoding='utf-8') as f:
    state = json.load(f)

# Get samples of items without dims
missing_items = []
for item in state['items']:
    has_dims = (item.get('image_width') and item.get('image_height'))
    if not has_dims and len(missing_items) < 3:
        missing_items.append(item)

for item in missing_items:
    print(f"ID: {item.get('id')}")
    print(f"  Title: {item.get('title', '')[:50]}")
    print(f"  image_1k: {item.get('image_1k', '')[:80]}")
    print(f"  image_thumb: {item.get('image_thumb', '')[:80]}")
    if item.get('mergedMedia'):
        print(f"  mergedMedia count: {len(item['mergedMedia'])}")
        for i, m in enumerate(item['mergedMedia'][:1]):
            print(f"    [{i}] image_1k: {m.get('image_1k', '')[:80]}")
    print()
