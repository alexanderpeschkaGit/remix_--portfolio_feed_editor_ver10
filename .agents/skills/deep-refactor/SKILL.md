---
name: deep-refactor
description: Execute broad architectural refactoring across multiple files with deterministic validation and self-healing multiagent loops. Triggered by #deep-refactor, /deep-refactor, #deeprefactor, or /deeprefactor.
---

# Deep Refactor Workflow

**Purpose:** Execute broad architectural refactoring across multiple files while preserving observable behavior. This uses a deterministic, self-healing multiagent loop combined with the `#delegate` workflow to prevent context bloat.

## Phase 1: Pre-inspection & Dependency Mapping (Coordinator)
1. **Inspect:** Analyze callers, shared types, state ownership, and platform-specific behaviors.
2. **Handle Ambiguity:** If requirements, state ownership, or edge cases are ambiguous, trigger a `#grillme` interview with the user to clarify boundaries before touching code.
3. **Map Collisions:** Identify shared dependencies (e.g., a common React Context or TypeScript interface). If multiple files modify a highly coupled dependency, refactor that shared dependency sequentially *first*, or group those files under a single subagent to prevent concurrent overwrite collisions.

## Phase 2: Dynamic Delegation (Scatter)
1. **Artifact Generation:** For independent file edits, the Coordinator writes specific, step-by-step implementation instructions into separate Markdown artifacts (e.g., `plan-Header.md`, `plan-Sidebar.md`) in the artifact directory using `write_to_file`.
   * Must provide `ArtifactMetadata` with `RequestFeedback: false`.
2. **Mega-File Strategy (>1,000 lines):** If a file is exceptionally large (e.g., >1,000 lines), do NOT scatter-gather all extractions at once, and do NOT rewrite the parent in-place. Execute a strict sequential pipeline:
   * **Step 1 (State & Context):** Extract shared Context providers and move global states to Zustand first. Validate.
   * **Step 2 (Hooks):** Extract massive `useEffect` blocks and complex logic into pure custom hooks. Validate.
   * **Step 3 (UI Subcomponents):** Push specific UI rendering logic down into leaf components, converting the parent into a simple router. Validate.
   * **Step 4 (Parallel Rebuild & Cutover):** Once only a hollow orchestration shell remains, rebuild that shell as a NEW file under its final target name (never a `V2` suffix; e.g. `video/VideoPlayerCore.tsx`) that composes the pieces extracted in Steps 1–3. The new file must assemble the already-extracted hooks/stores/components — never rewrite logic from memory, otherwise behavior preservation is no longer guaranteed (rewrite, not refactor).
     * Switch the imports of all callers to the new file only after it compiles cleanly on its own.
     * The plan artifact must contain a **behavior-parity checklist** of the observable behaviors to verify after cutover (e.g., for the video player: autoplay-on-scroll, fullscreen, audio unlock, Bunny iframe/native switching). The checklist is part of Phase 3 validation.
     * After parity is confirmed, MOVE the old mega-file into `backup_unused/` preserving its relative path (e.g., `backup_unused/src/components/VideoPlayer.tsx`) — never hard-delete it. `backup_unused/` is gitignored and serves as the local cross-check reference; it is pruned manually once parity is trusted.
   * **Headless Orchestrator Rule (default):** The rebuilt orchestrator manages state/lifecycle and renders only the concrete player/router. All overlay and presentation UI moves into dumb leaf components that receive narrow, typed props or selective Zustand subscriptions — never a monolithic state blob (anti-pattern: `<Overlay state={entireVideoState} />`). Ref wiring to media elements, fullscreen containers, and capability gates count as orchestration and stay in the core. Deviations from this default must be justified in the plan artifact.
   * **Threshold:** >1,000 lines triggers this pipeline by default. The Coordinator may deviate for smaller or trivially separable files, but must state the justification in the plan artifact.
3. **Model Routing (Decision Logic):** The Coordinator must evaluate the target file's size and complexity to assign the correct subagent model:
   * **Use `pro`** if: The file is >400 lines (to prevent truncation/omission as per AGENTS.md), contains complex cross-component state (Zustand), or handles subtle React hydration/lifecycle logic.
   * **Use `flash`** if: The file is <400 lines AND involves purely mechanical extractions, UI leaf components, CSS/Tailwind restructuring, or simple utility/type moving.
4. **Spawn Subagents:** Invoke multiple subagents concurrently (`invoke_subagent`).
   * **Model:** Set dynamically based on the routing decision above (`pro` or `flash`).
   * **Role:** Descriptive component-based title, e.g., `"${TargetName} Refactorer"` (e.g., `"Header Refactorer"`, `"Store Refactorer"`).
   * **Prompt:** Extremely minimal: *"Read the execution plan located at [Absolute Path to Artifact] and implement all steps. Do not run shell commands. Stop when complete. Architectural Rules: wire cross-component state to Zustand (`src/store/`), lifecycle/observers to custom hooks (`src/hooks/`), and pure math/logic to utilities (`src/utils/`)."*
5. **Execution Constraints:** Subagents must ONLY perform read/edit file operations. They are strictly forbidden from running shell commands to prevent terminal lock contention.
6. **Handoff & Wait:** The Coordinator waits for all concurrent subagents to report back with a lightweight status string.

## Phase 3: Deterministic Validation (Gather)
1. **Sequential Check:** Once all subagents report success, the Coordinator executes a single sequential type-check and build (e.g., `tsc --noEmit`, Vite build, or relevant test suites).
2. **Behavior Parity (Mega-File Cutovers only):** After a Step 4 cutover, the Coordinator additionally works through the behavior-parity checklist from the plan artifact. A green compiler alone does not prove that subtle behaviors (autoplay quirks, fullscreen fallbacks, platform workarounds) survived.
3. **Evaluate:** The Coordinator evaluates the file system state purely based on the deterministic output of the compiler/linter plus the parity checklist. Do not rely on subjective review.

## Phase 4: Self-Correction Loop (The Fixer Pipeline)
1. **Targeted Artifacts:** If the build fails, the Coordinator isolates the specific files throwing errors and writes a transient error artifact (e.g., `error-trace-[hash].md`) containing the exact compiler trace and previous file state.
2. **Spawn Fixers:** The Coordinator spawns targeted "Fixer" subagents pointing exclusively to the error artifact.
3. **Iteration Cap:** This error-correction loop has a strict maximum of **3 iterations**.

## Phase 5: Revert & Report
1. **Circuit Breaker:** If the build still fails after 3 Fixer iterations, or if requirements inherently conflict, the Coordinator automatically reverts the contested files to their pre-refactor state. After a failed Step 4 cutover this means: restore the caller imports to the legacy file (which still exists in place or in `backup_unused/` until parity is confirmed) and delete the new file. The loop is halted.
2. **Final Summary:** The Coordinator summarizes the successful structural changes, validation results, and surfaces any unresolved behavioral conflicts or reverted files for the user to manually resolve. It does not reproduce complete files in the chat.
3. **Documentation Evaluation & Prompt:** First, evaluate the refactor's impact. If the changes were purely cosmetic, strictly localized, or did not alter the overall system architecture, skip this step. However, if the refactor introduced new architectural patterns, modified global state, altered cross-component logic, or changed dependencies: (1) Read `AGENTS.md` and any relevant `.agents/rules/` files to analyze the current guidelines. (2) Strictly initiate a `#grillme`-style interview. Use your analysis to ask the prompter highly targeted, contextual questions about if and how these new patterns should modify the existing documentation.
