# Skill: Deep Refactor (#deep-refactor)

**Purpose:** Execute broad architectural refactoring across multiple files while preserving observable behavior. This uses a deterministic, self-healing multiagent loop combined with the `#delegate` workflow to prevent context bloat.

## Phase 1: Pre-inspection & Dependency Mapping (Coordinator)
1. **Inspect:** Analyze callers, shared types, state ownership, and platform-specific behaviors.
2. **Handle Ambiguity:** If requirements, state ownership, or edge cases are ambiguous, trigger a `#grillme` interview with the user to clarify boundaries before touching code.
3. **Map Collisions:** Identify shared dependencies (e.g., a common React Context or TypeScript interface). If multiple files modify a highly coupled dependency, refactor that shared dependency sequentially *first*, or group those files under a single subagent to prevent concurrent overwrite collisions.

## Phase 2: Dynamic Delegation (Scatter)
1. **Artifact Generation:** For independent file edits, the Coordinator writes specific, step-by-step implementation instructions into separate Markdown artifacts (e.g., `plan-Header.md`, `plan-Sidebar.md`) in the artifact directory using `write_to_file`.
   * Must provide `ArtifactMetadata` with `RequestFeedback: false`.
2. **Model Routing (Decision Logic):** The Coordinator must evaluate the target file's size and complexity to assign the correct subagent model:
   * **Use `pro`** if: The file is >400 lines (to prevent truncation/omission as per AGENTS.md), contains complex cross-component state (Zustand), or handles subtle React hydration/lifecycle logic.
   * **Use `flash`** if: The file is <400 lines AND involves purely mechanical extractions, UI leaf components, CSS/Tailwind restructuring, or simple utility/type moving.
3. **Spawn Subagents:** Invoke multiple subagents concurrently (`invoke_subagent`).
   * **Model:** Set dynamically based on the routing decision above (`pro` or `flash`).
   * **Role:** Descriptive component-based title, e.g., `"${TargetName} Refactorer"` (e.g., `"Header Refactorer"`, `"Store Refactorer"`).
   * **Prompt:** Extremely minimal: *"Read the execution plan located at [Absolute Path to Artifact] and implement all steps. Do not run shell commands. Stop when complete. Architectural Rules: wire cross-component state to Zustand (`src/store/`), lifecycle/observers to custom hooks (`src/hooks/`), and pure math/logic to utilities (`src/utils/`)."*
4. **Execution Constraints:** Subagents must ONLY perform read/edit file operations. They are strictly forbidden from running shell commands to prevent terminal lock contention.
5. **Handoff & Wait:** The Coordinator waits for all concurrent subagents to report back with a lightweight status string.

## Phase 3: Deterministic Validation (Gather)
1. **Sequential Check:** Once all subagents report success, the Coordinator executes a single sequential type-check and build (e.g., `tsc --noEmit`, Vite build, or relevant test suites).
2. **Evaluate:** The Coordinator evaluates the file system state purely based on the deterministic output of the compiler/linter. Do not rely on subjective review.

## Phase 4: Self-Correction Loop (The Fixer Pipeline)
1. **Targeted Artifacts:** If the build fails, the Coordinator isolates the specific files throwing errors and writes a transient error artifact (e.g., `error-trace-[hash].md`) containing the exact compiler trace and previous file state.
2. **Spawn Fixers:** The Coordinator spawns targeted "Fixer" subagents pointing exclusively to the error artifact.
3. **Iteration Cap:** This error-correction loop has a strict maximum of **3 iterations**. 

## Phase 5: Revert & Report
1. **Circuit Breaker:** If the build still fails after 3 Fixer iterations, or if requirements inherently conflict, the Coordinator automatically reverts the contested files to their pre-refactor state. The loop is halted.
2. **Final Summary:** The Coordinator summarizes the successful structural changes, validation results, and surfaces any unresolved behavioral conflicts or reverted files for the user to manually resolve. It does not reproduce complete files in the chat.