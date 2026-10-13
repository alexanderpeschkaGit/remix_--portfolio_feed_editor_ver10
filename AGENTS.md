# Portfolio Editor - Canonical AI Agents Hub

This file (`AGENTS.md`) is the Single Source of Truth for all AI coding assistants (Antigravity, Cursor, Windsurf, Cline, Copilot, etc.) working on this project. Project-specific behavior and architecture rules take precedence over general coding preferences.

> [!IMPORTANT] IDE / COPILOT ROUTING INSTRUCTIONS
> External AIs MUST manually read the corresponding `.agents/rules/*.md` files based on the domain they are modifying before writing any code.
> AI models MUST manually read `.agents/skills/<name>.md` when a user uses tags like `#ask`, `#plan`, `#review`, `#exec`, `#deep-refactor`, etc., as defined in the IDE config files (`.clinerules`, `.windsurfrules`).

## Architecture & Constraints
- **Frontend:** React 19, Vite, Tailwind CSS, Lucide React (Icons), dnd-kit (Drag & Drop).
- **Backend:** Express.js (Node.js) running on port 3000.
- **Storage:** Local file system (`/data` directory) for state and images.
- **Cloud:** Cloudflare R2 for public hosting and image delivery.
- **Cloudflare Credentials:** Stored securely in `.env`. DO NOT hardcode them.
- **Canonical paths & ownership (deep-refactor 2026-10-13):** `App.tsx` is the orchestrator only; `src/hooks/` owns one state/effect/handler cluster per file (custom hooks may own state + effects + lifecycle); `src/utils/` holds pure logic; `src/components/` holds leaf UI. `updatePosts` (in `src/hooks/useUndoHistory.ts`) is the single central mutation point, returned to `App.tsx` and passed to consumers. Hooks receive dependencies declared later in `App.tsx` via closure adapters (`(v) => setX(v)`) or getters (`() => value`).
- **Published-HTML generation (batch 15b):** The portfolio page template is split into section builders — `src/utils/portfolioHtmlParts.ts` (favicons, post-cards builder, head, styles, data script, body) plus `src/utils/portfolioHtmlRuntimeCore.ts` and `src/utils/portfolioHtmlRuntimeLightbox.ts` (the two runtime `<script>` halves, split at `renderGallery`). Published output MUST stay byte-identical when editing these files; verify with `npx tsx scripts/html-parity-fixture.ts <dir>` and compare hashes.
- **Upload flows (batch 15b):** `src/hooks/useMediaUploads.ts` is a thin orchestrator; the real pipelines live in `src/hooks/uploadImageFlow.ts` (image) and `src/hooks/uploadVideoFlow.ts` (Bunny video + link change), injected with deps from the hook.
- **Status notices (batch 15b):** `src/hooks/useStatusNotice.ts` owns the notice state/timer; `src/components/StatusNotice.tsx` is the leaf. Leaf components `FallbackBanner`/`ResolutionToast` in `src/components/` render their visibility from props passed by `App.tsx`.

## Dual-Environment Constraint (CRITICAL)
This application must run flawlessly in TWO environments:
1. **Web-based Preview (AI Studio/Cloud Run):** Runs behind an Nginx reverse proxy.
2. **Local Windows 11 Machine:** Runs via a local Node.js server (`start_windows.bat` or `run_fast.bat`).

## Host Environment & File System
- **OS:** Windows 11 (x64)
- **Shell:** PowerShell
- **Encoding:** ALL file I/O MUST use explicit, buffer-safe UTF-8 encoding. Violations cause umlaut corruption (ä, ö, ü) and emoji breakage.
- **Testing after changes:**
  - **Browser Reload:** If only CSS/HTML/JS in the frontend changed.
  - **`run_fast.bat`:** For fast backend logic updates or cache resets.
  - **`autostart.bat`:** Only for fundamental structural changes or service re-initialization.
  - *Never execute these batch files autonomously. Always provide the command for manual confirmation.*

## Dynamic Rules & Progressive Disclosure
To keep the AI agent fast, specific architectural rules have been extracted to `.agents/rules/`. The AI should load these rules when working on specific areas:
- `.agents/rules/representation-r2.md`: Cloudflare R2 Direct Strategy for the AI handling the portfolio display.
- `.agents/rules/bio-display.md`: Logic for displaying the bio section.
- `.agents/rules/autorun.md`: Autorun execution rules.

## Execution Mode (Auto-Pilot)
- **Auto-Pilot: ENABLED** for `#deep-refactor` and `#exec` batch runs. Per `.agents/skills/deep-refactor/SKILL.md` Phase 3, item 6 (*Communicative Stop & Auto-Pilot Resolution*), proceed batch-to-batch WITHOUT waiting for user confirmation, as long as every batch passes `npm run lint` (`tsc --noEmit`) and `npm run build` (`vite build`) with **no new errors versus the baseline**.
- **Always stop and wait** for: a batch that still fails after 3 targeted repair iterations; new material ambiguity (run `#grillme`); any irreversible or external action that leaves the local working tree (`git push`, `git tag`, `git reset --hard`, any `.bat` file, R2/publish/Bunny calls); and each decision checkpoint defined by the active plan.
- **Commit handling (conditional):** A local `git commit` is **not** an irreversible external action. Checkpoint commits authorized by an active plan or by Auto-Pilot (`#deep-refactor`, `#exec`) are pre-authorized and must proceed without a confirmation stop. Outside a plan, ask about committing only when **all** of these hold: the task changed files, no commit question was already answered in this session, and the working tree holds no unrelated changes that the commit would sweep in. Otherwise close the turn with a plain statement ("Next step: commit — not executed") instead of a question.
- **Parity caveat:** a green compiler is not behavior parity. Mark browser/manual smoke items as `unverified` and carry them forward to the next checkpoint.
- This directive governs execution flow only. It never overrides the encoding, file-size, terminal-safety, or manual-confirmation rules in this file.

## Context Hygiene (do NOT load unless asked)
- `docs/` (e.g. `docs/HOWTOUSE.md` with all buttons and keyboard shortcuts) is human documentation. Read it only when the user explicitly asks about usage or shortcuts.
- `prompts/` holds prompt templates the app sends to an LLM at runtime. They are app data, not rules for you.
- Load files under `.agents/rules/` only when the task touches their topic.

## Code Quality
- Follow standard Clean Code principles. Use explicit types in TypeScript.
- Provide clear, descriptive commit logs/change logs for each `#exec`.
- **File Size & Refactoring Limits:**
  - **300–499 lines (Warning & Refactor Suggestion):** Actively warn the user that the file is approaching critical complexity and provide an actionable decomposition suggestion.
  - **500+ lines (Mandatory Pro Decomposition):** Strictly refactor. If extraction boundaries are fully clear, delegate to a `pro` subagent. Otherwise, trigger a `#grillme` interview.
  - **Post-refactor follow-ups (2026-10-13):** `App.tsx` (was 5,213) is now 447 lines ✓; `src/hooks/useMediaUploads.ts` and `src/utils/generatePortfolioHtml.ts` are decomposed ✓. Watch list (approaching the 500-line limit by design of the template split): `src/utils/portfolioHtmlRuntimeCore.ts` (~438) and `src/utils/portfolioHtmlRuntimeLightbox.ts` (~381) — if the embedded runtime script grows, split again at a function boundary.
- Strictly avoid omitting code or using placeholders like `// ...`. Retain all existing props, types, and logic unless explicitly instructed otherwise.
- **Script Organization:** All one-off utility scripts, automated patches, python scrapers, and test scripts must be placed in the `scripts/` directory.

## Tool-Logic & System-Level Constraints (IDEs, AI, Git)
- **Terminal & Agent Execution Safety:**
  - **Single-Action Protocol:** Execute state-changing shell commands sequentially. Avoid chaining commands with `&&` or `;` in automated execution loops. Observe exit codes and stderr after each individual step.
  - **Trace & Verify:** If a terminal command or script fails, run an explicit diagnostic command (`Get-Content`, `Select-String`, `git status`) to verify the root cause before attempting a secondary fix. Never repeat the same fix without new evidence.
  - **Structured Reasoning:** Keep internal reasoning concise and structured rather than generating long, reflective first-person prose during tool-execution loops.

## AI Assistant Meta-Rules
- **Single-Question Rule:** End a turn with at most **one** open question. If several decisions are pending, bundle them into that one question.
- **Quiet Zone (no questions):** read-only workflows (`#ask`, `#plan`, `#review`); a question the user already answered in this session (stay with that answer); trivial single-file changes the user verifies by browser reload; and pure progress or checkpoint reports that contain no decision. When in doubt, act and state the outcome rather than asking.
- **Documentation Prompt (conditional):** Ask the prompter whether a change should be documented in this `AGENTS.md` (or its `.agents/rules/` counterparts) **only** when the change actually alters durable, always-relevant facts or introduces a new convention:
  - architecture/stack, storage conventions or canonical paths;
  - file-size thresholds, dual-environment, encoding, delegation or tool-logic rules;
  - a new/renamed `.agents/rules/*.md`, or a new custom skill or trigger tag (`.agents/WORKFLOWS.md`).
  - Do **not** ask for bug fixes, UI tweaks, refactors that stay inside the existing architecture, or test-, copy- and script-only changes.
  - Ask once, bundled at the end of the task — never per batch or per file — and skip the question when the task already edited the documentation files itself. If no trigger applies, state the result and move on.
- **Skill Routing Registration:** Whenever creating a new custom skill inside `.agents/skills/`, the AI MUST automatically register its trigger tag (e.g., `#skillname`) in `.agents/WORKFLOWS.md`.
