# Portfolio Editor

A web-based portfolio management tool that allows you to scrape images from Flickr/Instagram, manage high-resolution assets, and publish to Cloudflare R2.

### Running the Application

- **Standard Start:** Run `start_windows.bat`. This checks for dependencies and starts the server.
- **Fast Start:** Run `run_fast.bat`. This starts the server directly without checking dependencies.

## Documentation for AI Assistants

This project is designed to be managed by AI assistants. The following files provide context:

- `AGENTS.md`: Single source of truth (architecture, environment constraints, code quality). Tool-specific files (`.clinerules`, `.windsurfrules`, `CLAUDE.md`, `.cursor/rules/agents.mdc`, `.github/copilot-instructions.md`) only point to it.
- `.agents/rules/`: Modular rules (`workflow.md` for shortcut tags, `representation-r2.md`, `bio-display.md`).
- `prompts/`: Prompt templates used by the app itself (not rules for coding agents).
- `docs/HOWTOUSE.md`: Human user manual (buttons and keyboard/mouse shortcuts). Not loaded by agents unless asked.
- `metadata.json`: Application settings.

### AI Shortcut Commands
Defined in `.agents/rules/workflow.md`: `#plan`, `#exec [step]`, `#review`, `#check`, `#ask`, `#grillme`, `#flash`, `#refactor`.

## Project Architecture
The active application is implemented in `src/` with a modular React structure.
- `src/App.tsx` is the main entry point.
- `src/hooks/useRearrangeState.ts` manages reorder/selection state for the rearrange workflow.
- `src/hooks/useLightboxState.ts` manages lightbox modal UI state.
- `src/components/modals/RearrangeModal.tsx` and `src/components/modals/LightboxModal.tsx` contain the modal UI components.

### Notes
- `backups_app/` is intentionally preserved and contains backup copies and older integration references.
- Active source code lives under `src/`; runtime build is driven by `vite` and `package.json`.
- `data/` (runtime state: `state.json`, previews, uploads, etc.) is **gitignored** by design — it is not version-controlled. Migration scripts (e.g. `scripts/migrate-*.ts`) automatically back up `data/state.json` to `backups/data/` before applying changes.
