# Portfolio Representation AI Guide (Direct R2 Strategy)

This guide is for the AI or external backend script responsible for representation and text generation. It explains how to push metadata updates (e.g. improved titles, better descriptions, categorized tags) directly to the Cloudflare R2 storage without relying on the Editor's local API.

## Architecture & Performance
To ensure that the pure display performance (rendering/serving of the website) does not suffer:
1. **Asynchronous Updates:** Any data refinement (e.g., calling an LLM to generate a better bio or description) and the subsequent upload to R2 MUST happen in an asynchronous background thread or task. It should never block the main rendering thread or the user's request.
2. **CDN Caching:** The live website reads `state.json` directly from the Cloudflare CDN edge. Modifying the file in the R2 bucket takes a few milliseconds and automatically invalidates/updates the edge cache.
3. **Atomic `state.json` Updates:** You should only fetch `state.json`, apply your specific changes, update the `lastUpdated` timestamp, and push it back. You do *not* need to regenerate the static `index.html`—the live site and the editor will both dynamically react to the new `state.json`.

## Required Configuration
You will need S3-compatible credentials for Cloudflare R2:
- **R2 Account ID**
- **Access Key ID**
- **Secret Access Key**
- **Bucket Name**

## Workflow for Updating an Item

### 1. Fetch the Current State
Download the current `state.json` directly from the public URL (or via S3 API) to ensure you have the latest data.
```bash
curl https://[YOUR_PUBLIC_R2_DOMAIN]/state.json -o current_state.json
```

### 2. Modify the State (Locally in Memory)
Parse the JSON and find the item you want to modify using its `id`.
Apply your changes (e.g., `title`, `description`).
**CRITICAL:** You must update the `lastUpdated` property at the root of the JSON so the Editor knows there are new changes!
```json
{
  ...
  "lastUpdated": "2026-04-24T12:00:00.000Z",
  "items": [
    {
      "id": "12345",
      "title": "New AI Generated Title",
      ...
    }
  ]
}
```

### 3. Upload directly to Cloudflare R2 (Python Example)
Use `boto3` (AWS SDK) to push the modified JSON back to the bucket asynchronously.

```python
import boto3
import json
import threading
from datetime import datetime, timezone

def update_item_in_background(item_id, new_title=None, new_description=None):
    # This runs in a background thread to not block performance!
    def _upload():
        s3 = boto3.client('s3',
            endpoint_url='https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com',
            aws_access_key_id='<YOUR_ACCESS_KEY>',
            aws_secret_access_key='<YOUR_SECRET_KEY>'
        )
        
        # 1. Fetch latest state
        response = s3.get_object(Bucket='<YOUR_BUCKET>', Key='state.json')
        state = json.loads(response['Body'].read().decode('utf-8'))
        
        # 2. Modify item
        for item in state.get('items', []):
            if str(item['id']) == str(item_id):
                if new_title: item['title'] = new_title
                if new_description: item['description'] = new_description
                break
                
        # 3. Update Timestamp
        state['lastUpdated'] = datetime.now(timezone.utc).isoformat()
        
        # 4. Upload back to R2
        s3.put_object(
            Bucket='<YOUR_BUCKET>',
            Key='state.json',
            Body=json.dumps(state, indent=2).encode('utf-8'),
            ContentType='application/json'
        )
        print(f"Successfully updated {item_id} in R2.")

    # Start the async thread
    threading.Thread(target=_upload).start()
```

## Editor Sync Loop
Because you updated the `lastUpdated` timestamp in `state.json`, the local Admin Editor (which polls the R2 bucket every 15 seconds) will automatically detect the change. The "Load Cloud" button will flash green, alerting the human editor that the AI has curated new content which can be pulled into their local workspace with one click.

## Reading Data (Consuming the SSOT)

This guide is for the AI responsible for metadata updates (improved titles, descriptions, categorized tags) directly via Cloudflare R2.

### Workflow for Updating items
1. **Fetch current `state.json`** from R2.
2. **Convert items to Lookup (In-Memory)** for fast access by ID (Optional, but recommended for speed).
3. **Apply Modifications** to your specific item(s) within the array.
4. **Update `lastUpdated`** at the root of the JSON (ISO string).
5. **Upload back to R2** (Keep the array structure intact!).

### Python Example
```python
import boto3
import json
from datetime import datetime, timezone

def update_item(item_id, new_title, new_description=None):
    # Setup S3 Client (compatible with R2)
    s3 = boto3.client('s3',
        endpoint_url='https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com',
        aws_access_key_id='<YOUR_ACCESS_KEY>',
        aws_secret_access_key='<YOUR_SECRET_KEY>'
    )
    
    # 1. Fetch from R2
    response = s3.get_object(Bucket='portfoliodata', Key='state.json')
    state = json.loads(response['Body'].read().decode('utf-8'))
    
    # 2 & 3. Update item in Array (Keeping the array intact!)
    for item in state.get('items', []):
        if str(item['id']) == str(item_id):
            if new_title: item['title'] = new_title
            if new_description: item['description'] = new_description
            break
            
    # 4. Update Root Timestamp
    state['lastUpdated'] = datetime.now(timezone.utc).isoformat()
    
    # 5. Save back to R2
    s3.put_object(
        Bucket='portfoliodata', 
        Key='state.json', 
        Body=json.dumps(state, indent=2).encode('utf-8'),
        ContentType='application/json'
    )
```
