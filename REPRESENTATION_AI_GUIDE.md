# Portfolio Representation AI Guide

This guide describes how an external AI or script (such as the public-facing portfolio website or representation scripts) can update portfolio items back to the central Editor backend. 

## Endpoints

### 1. `POST /api/item/update`
Use this endpoint to update specific fields of a single portfolio item. This allows you to apply corrections, layout changes, or metadata updates directly from the live public site into the single source of truth (the editor's state.json).

**Important Note:** The update merges with the existing post state. You only need to send the fields you want to modify. Do not send fields that should remain unchanged.

**Headers:**
- `Content-Type: application/json`

**Body Structure:**
```json
{
  "id": "string (Required: the unique ID of the post to update)",
  "title": "string (Optional: new title for the post)",
  "description": "string (Optional: new description/text for the post, supports basic HTML like <br/>)",
  "states": ["string", "string"] (Optional: array of category IDs to assign to this post)
}
```

**Example Request (Update Title & Description):**
```bash
curl -X POST https://your-editor-domain.com/api/item/update \
  -H "Content-Type: application/json" \
  -d '{
    "id": "flickr-17192837482",
    "title": "Updated Artwork Title",
    "description": "A refined description of this amazing artwork."
  }'
```

**Response:**
On success, you will receive a 200 OK containing the newly merged item state and a `success: true` flag. Behind the scenes, the editor updates the `state.json` file in Cloudflare R2 and bumps the `lastUpdated` timestamp.

## Synchronization Loop
The editor frontend polls for changes made by external scripts. When you successfully push an update to `/api/item/update`, the next time the admin opens the Portfolio Editor, the "Load Cloud" button will blink green to notify them that the Representation AI has made updates that they can load into their active session. 
