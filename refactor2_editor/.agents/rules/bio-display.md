# Frontend Display Instructions for Bio Feature

## Overview
The portfolio bio is now stored in the R2 bucket (`state.json`) and embedded in the generated `index.html`. This guide explains how to access and display it on your frontend.

---

## Data Location

### 1. In `state.json` (R2 Bucket)
```json
{
  "title": "ProjectionArt by Vijay Sikanda",
  "subtitle": "immersive projection experience",
  "bio": "Your edited bio text here...",
  "items": [...],
  "lastUpdated": "2026-04-18T...",
  "scrapeConfig": {...}
}
```

### 2. In Embedded HTML (Static Publishing)
The bio is injected into the generated `index.html` as a JSON script tag:
```html
<script id="portfolio-data" type="application/json">
{
  "title": "ProjectionArt by Vijay Sikanda",
  "subtitle": "immersive projection experience",
  "bio": "Your edited bio text here...",
  "items": [...]
}
</script>
```

---

## Implementation Examples

### Option 1: Dynamic Loading from R2 (Recommended for Modern SPAs)
```typescript
// Load from R2 bucket
async function loadPortfolioData() {
  try {
    const response = await fetch('https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev/state.json');
    const data = await response.json();
    displayBio(data.bio);
  } catch (error) {
    console.error('Failed to load portfolio data:', error);
  }
}

function displayBio(bio: string) {
  const bioContainer = document.getElementById('portfolio-bio');
  if (bioContainer && bio) {
    bioContainer.innerHTML = `<div class="bio">${bio}</div>`;
  }
}
```

### Option 2: From Embedded Data (Static HTML)
```typescript
// Extract from embedded script tag
function getPortfolioBio(): string {
  const elem = document.getElementById('portfolio-data');
  if (elem) {
    try {
      const data = JSON.parse(elem.textContent || '{}');
      return data.bio || '';
    } catch (e) {
      console.error('Failed to parse embedded data:', e);
    }
  }
  return '';
}

// Display it
const bio = getPortfolioBio();
if (bio) {
  const container = document.querySelector('.bio-section');
  if (container) {
    container.textContent = bio;
  }
}
```

### Option 3: React Component
```tsx
import { useState, useEffect } from 'react';

export function PortfolioBio() {
  const [bio, setBio] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try embedded data first
    const elem = document.getElementById('portfolio-data');
    if (elem) {
      try {
        const data = JSON.parse(elem.textContent || '{}');
        if (data.bio) {
          setBio(data.bio);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error('Error parsing embedded data:', e);
      }
    }

    // Fallback to R2 fetch
    fetch('https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev/state.json')
      .then(res => res.json())
      .then(data => {
        setBio(data.bio || '');
        setLoading(false);
      })
      .catch(error => {
        console.error('Failed to load portfolio data:', error);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!bio) return null;

  return (
    <section className="portfolio-bio">
      <p>{bio}</p>
    </section>
  );
}
```

---

## Styling & Display Recommendations

### HTML Structure
```html
<section id="bio-section" className="bio-container">
  <h2>About</h2>
  <p id="portfolio-bio"></p>
</section>
```

### CSS Styling
```css
.bio-container {
  max-width: 800px;
  margin: 2rem auto;
  padding: 2rem;
  background: #f9f9f9;
  border-radius: 8px;
  line-height: 1.6;
  color: #333;
}

.bio-container h2 {
  margin-top: 0;
  color: #222;
  font-size: 1.5rem;
}

.bio-container p {
  margin: 1rem 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}
```

---

## API R2 Configuration

**R2 Bucket Details:**
- **Public Domain:** `https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev`
- **File:** `/state.json`
- **Format:** JSON
- **Updated:** On every PUBLISH button click

**Direct URL:**
```
https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev/state.json
```

---

## Data Persistence & Updates

1. **Editing:** Use the "Bio" button in the editor to edit the bio text
2. **Saving:** Bio is auto-saved locally (debounced)
3. **Publishing:** Click "PUBLISH" to upload to R2
4. **Frontend Updates:** Your frontend should refetch `state.json` or reload to display the latest bio

---

## Handling Line Breaks

The bio text may contain line breaks. Use these approaches:

### Preserve Formatting (Text)
```html
<pre>{bio}</pre>
<!-- or -->
<p style="white-space: pre-wrap">{bio}</p>
```

### Convert to HTML (Markdown-like)
```typescript
function formatBio(text: string): string {
  return text
    .split('\n')
    .map(line => `<p>${line}</p>`)
    .join('');
}
```

---

## Error Handling

```typescript
async function loadBioSafely(): Promise<string> {
  try {
    // Try embedded first
    const elem = document.getElementById('portfolio-data');
    if (elem?.textContent) {
      const data = JSON.parse(elem.textContent);
      if (data.bio) return data.bio;
    }
  } catch (e) {
    console.warn('Embedded data parsing failed:', e);
  }

  try {
    // Fetch from R2 with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(
      'https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev/state.json',
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      return data.bio || '';
    }
  } catch (e) {
    console.warn('R2 fetch failed:', e);
  }

  return ''; // Fallback: no bio
}
```

---

## Testing

### Manual Testing Steps:
1. Edit bio in the editor (Bio button)
2. Click PUBLISH
3. Wait 2-3 seconds for upload
4. Check `https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev/state.json`
5. Verify `"bio"` field contains the new text
6. Refresh your frontend and confirm the bio displays

### Browser Console Check:
```javascript
// In browser console
fetch('https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev/state.json')
  .then(r => r.json())
  .then(data => console.log('Bio:', data.bio))
```

---

## Migration Notes

- **Existing portfolios:** If you have an old `state.json` without a bio field, it will simply be empty (`""`) until edited
- **Backward compatibility:** Frontends not using the bio field are unaffected
- **Auto-migration:** New projects will include the bio field by default

---

## Support

If the bio isn't updating:
1. Ensure you clicked the "Bio" button and saved it
2. Verify you clicked "PUBLISH" to push to R2
3. Check browser console for CORS or fetch errors
4. Clear your browser cache and reload
5. Verify the R2 bucket public domain matches the URL above
