# Plan: Bilingual Portfolio (DE / EN) & AI Integration

## 1. Data Structure Update
We want to add a German version of titles and descriptions to the portfolio items without breaking the current setup.
**Decision Needed (Pending):**
- **Option A (Recommended):** Expand the existing `state.json` schema. Add `title_de` and `description_de` to each item. This keeps the React state management and saving logic simple. (Size increase to ~1MB is completely negligible).
- **Option B:** Create a separate `data/translations_de.json` mapping `id -> { title, description }`. This keeps the main file untouched but requires merging data in the frontend.

## 2. Existing Data Migration (Automated)
Once the data structure is chosen, a one-time Node.js script will be written to iterate through the existing `state.json` entries. It will use an AI API to translate the English titles and descriptions into German and populate the new `_de` fields automatically.

## 3. Editor (Backend) Updates
- Expand the input forms in `FeedPostCard.tsx` (or wherever the editor fields reside).
- Add dual inputs: one for English (default) and one for German. This ensures the automated translations can be manually refined at any time.

## 4. Frontend (Public View) Updates
- Add a Language Toggle (DE / EN) to the main portfolio UI.
- React will dynamically pull either `item.title` / `item.description` or `item.title_de` / `item.description_de` based on the active language state.

## 5. "KI-Edit" Button Integration
The existing AI enhancement button ("🤖 KI-Edit", which triggers `/api/ki-edit`) will be upgraded:
- The system prompt in `/api/ki-edit` will be modified so the AI generates the structured Case Study in **both languages** simultaneously.
- The endpoint will return JSON: `{ "en": "...", "de": "..." }`.
- When clicked, the Editor will automatically populate both the English and German input fields with the fresh, translated AI content.

---
**How to resume:** 
Just tell the AI: *"Let's implement the bilingual feature according to docs/PLAN_BILINGUAL.md. I choose Option [A/B] for the data structure."*
