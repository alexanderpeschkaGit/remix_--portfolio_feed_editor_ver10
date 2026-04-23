# Portfolio Editor

A web-based portfolio management tool that allows you to scrape images from Flickr/Instagram, manage high-resolution assets, and publish to Cloudflare R2.

## Getting Started

### Prerequisites
- Node.js (https://nodejs.org/)

### Installation
1. Clone the repository.
2. Run `npm install` in the root directory.
3. Create a `.env` file based on `.env.example` and add your Cloudflare R2 credentials.

### Running the Application

- **Standard Start:** Run `start_windows.bat`. This checks for dependencies and starts the server.
- **Fast Start:** Run `run_fast.bat`. This starts the server directly without checking dependencies.

## Documentation for AI Assistants

This project is designed to be managed by AI assistants. The following files provide context:

- `.cursorrules`: Contains project architecture, environment constraints, and AI shortcut commands.
- `HOWTOUSE.md`: User manual for the Admin Panel.
- `metadata.json`: Application settings.

### AI Shortcut Commands
- `#plan`: Create a step-by-step architecture plan.
- `#exec [step]`: Execute a specific step.
- `#review`: Analyze code for errors/improvements.
- `#check`: Assess task complexity.

## Project Architecture
The active application is implemented in `src/` with a modular React structure.
- `src/App.tsx` is the main entry point.
- `src/hooks/useRearrangeState.ts` manages reorder/selection state for the rearrange workflow.
- `src/hooks/useLightboxState.ts` manages lightbox modal UI state.
- `src/components/modals/RearrangeModal.tsx` and `src/components/modals/LightboxModal.tsx` contain the modal UI components.

### Notes
- `backups_app/` is intentionally preserved and contains backup copies and older integration references.
- Active source code lives under `src/`; runtime build is driven by `vite` and `package.json`.

[!IMPORTANT]
> **AI INSTRUCTIONS:**
> Wenn du (KI/Agent) an diesem Projekt arbeitest, lies ZUERST die Datei 
> [AI_SYSTEM_INSTRUCTIONS.md](./AI_SYSTEM_INSTRUCTIONS.md) und befolge alle 
> dort definierten Regeln strikt.