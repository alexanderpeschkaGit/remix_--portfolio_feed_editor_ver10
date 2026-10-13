# Portfolio Editor

A web-based portfolio management tool that allows you to scrape images from Flickr/Instagram, manage high-resolution assets, and publish to Cloudflare R2.

### Running the Application

- **Standard Start:** Run `start_windows.bat`. This checks for dependencies and starts the server.
- **Fast Start:** Run `run_fast.bat`. This starts the server directly without checking dependencies.

## Documentation for AI Assistants

This project is designed to be managed by AI assistants. The following files provide context:

- `AGENTS.md`: Single source of truth (architecture, environment constraints, code quality). Tool-specific files (`.clinerules`, `.windsurfrules`, `CLAUDE.md`, `.cursor/rules/agents.mdc`, `.github/copilot-instructions.md`) only point to it.
- `.agents/rules/`: Modular domain rules (`app-architecture.md` module-ownership map, `representation-r2.md`, `bio-display.md`, `autorun.md`).
- `.agents/WORKFLOWS.md`: Maps every shortcut tag to its skill file under `.agents/skills/`.
- `prompts/`: Prompt templates used by the app itself (not rules for coding agents).
- `docs/HOWTOUSE.md`: Human user manual (buttons and keyboard/mouse shortcuts). Not loaded by agents unless asked.
- `metadata.json`: Application settings.

### AI Shortcut Commands
Defined in `.agents/WORKFLOWS.md`: `#ask`, `#grillme`, `#plan`, `#exec`, `#flash`, `#review`, `#refactor`, `#delegate`, `#solve`, `#deep-refactor`.

## Project Architecture
The active application is implemented in `src/` with a modular React structure. `AGENTS.md` is the canonical description; `.agents/rules/app-architecture.md` is the authoritative module-ownership map.
- `src/App.tsx` is the orchestrator only (~450 lines): it composes hooks and leaf components, no business logic. `updatePosts` in `src/hooks/useUndoHistory.ts` is the single central mutation point.
- `src/hooks/` owns one state/effect/handler cluster per file (undo/redo, media interaction, scrape/sync, cloud sync, trash, uploads, publishing, backups, R2 maintenance, post actions/ordering, boot, persistence, editor lifecycle, status notices).
- `src/utils/` holds pure, React-free logic (media helpers, cloud compare, server-state cleaning, portfolio-HTML generation).
- `src/components/` holds leaf UI (modals, header, feed, gallery) driven only by props.
- Server code lives in `src/server/` and `src/services/`, with the Express entry point at `server.ts`.

### Notes
- `backups_app/` is intentionally preserved and contains backup copies and older integration references.
- Active source code lives under `src/`; runtime build is driven by `vite` and `package.json`.
- `data/` (runtime state: `state.json`, previews, uploads, etc.) is **gitignored** by design — it is not version-controlled. Migration scripts (e.g. `scripts/migrate-*.ts`) automatically back up `data/state.json` to `backups/data/` before applying changes.
