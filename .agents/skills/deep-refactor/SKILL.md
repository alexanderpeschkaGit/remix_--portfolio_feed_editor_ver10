---
name: deep-refactor
description: "Plan and execute behavior-preserving deep refactors across multiple files with a clean-baseline check, strict batch limits, validation, and user approval checkpoints. Use for large refactors, mega-files, architectural decomposition, or when invoking #deep-refactor, /deep-refactor, #deeprefactor, or /deeprefactor."
---

# Deep Refactor Workflow

**Purpose:** Deliver a behavior-preserving architectural refactor through small, reviewable stages. Do not equate fewer lines, more files, or a green compiler with a successful refactor.

## Phase 1: Baseline, Scope, and Plan

### 1. Establish the source of truth
- Treat the current repository state as the sole source of truth, including after a reset. Never discard or overwrite existing user changes.
- Inspect `git status` before editing. Identify existing user changes and preserve them.
- Never run reset, checkout, clean, or other destructive commands to prepare for the refactor.
- Do not reuse or reapply implementation from a previous refactor unless the user explicitly requests it. Carry forward only verified behavior requirements, tests, risks, and architectural observations.
- Exclude lockfiles, build output, vendor directories, and generated files from refactor edits. A lockfile may be updated only when an intentional dependency-manifest change requires it.

### 2. Read project instructions and map behavior
- Read the repository's canonical `AGENTS.md` and any applicable domain rules. Prioritize any supplementary domain checklists provided manually by the user.
- Inspect relevant callers, shared types, current state and ref ownership, effects, platform-specific behavior, tests, and build configuration.
- Identify the user-visible behaviors and contracts that must remain unchanged.
- Record relevant baseline checks and any pre-existing failures.

### 3. Resolve ambiguity before editing
- If requirements, state ownership, or API boundaries are ambiguous, ask focused questions before changing code.
- Do not edit code until the user approves the proposed plan.

### 4. Present a concise plan
Before implementation, present:
- The intended scope and explicit exclusions.
- Proposed responsibility boundaries and state/ref ownership.
- A dependency-aware sequence of batches.
- Observable behavior and parity checks.
- Per-batch validation commands.

**MANDATORY CHECKPOINT & MODEL HANDOFF:** 
- Stop generation immediately after presenting the plan. 
- Do NOT invoke file modification tools yet. 
- Output this exact message: *"Plan complete. If you are using a heavy reasoning model (e.g., DeepSeek V4 or Gemini Advanced), you may now switch to a faster coding model (e.g., 4.1-Flash or Gemini Flash) for the execution batches. Type 'GO' or enable Auto-Pilot to begin Phase 2."*

## Phase 2: Batch Design and Execution

### 1. Batch limits
- Change at most **3 implementation files per batch** as the default limit.
- If a coherent step requires more tightly coupled files that cannot be safely split, explain why and ask the user to approve a specifically scoped exception before editing.
- Count added, modified, moved, and deleted implementation files toward the limit.
- Keep formatting-only changes and unrelated bug fixes out of scope.

### 2. Refactor responsibilities & Code Integrity
- Extract code only when the new boundary has a clear responsibility and ownership contract.
- Do not create thin wrappers, duplicate state, or oversized parameter bags merely to shrink the original file.
- Keep state local unless multiple consumers genuinely need shared ownership.
- Custom hooks may own state, effects, and lifecycle behavior. They do not need to be pure, just focused.
- Put reusable pure logic in utilities and presentation in leaf components.
- **Environment-Aware Editing:** 
  - If the environment (like Anti-Gravity) provides a `search_replace` or diff-based tool, use it to target only the modified lines.
  - If you must write the full file (e.g. via `write_file`), you are STRICTLY FORBIDDEN from using lazy truncation (e.g., `// ... rest of code`, `// existing logic`). You must output the entire file content verbatim, maintaining exact parity for unmodified functions.

### 3. Decomposition & Mega-file pipeline
Project-specific rules take precedence. If the repository's `AGENTS.md` requires decomposition at a lower threshold (e.g., 500+ lines) or mandates specific subagent models or a `#grillme` interview depending on complexity, follow those guidelines first. For exceptionally large files or when instructed, apply the following sequential pipeline. Do not perform a one-shot rewrite or recreate behavior from memory.
1. **Ownership:** Map state, refs, effects. Change ownership only where justified. Validate and pause.
2. **Behavioral logic:** Extract focused lifecycle or domain logic. Validate and pause.
3. **Presentation:** Extract specific UI into leaf components. Validate and pause.
4. **Orchestrator cutover:** Compose validated extractions into the final orchestrator. Complete parity checklist before moving legacy implementation to `backup_unused/`.

### 4. Delegation
- Follow `AGENTS.md` for required subagent delegation.
- Delegate only bounded work with clear file ownership and stop conditions.
- Do not delegate concurrent edits to shared or highly coupled files.

## Phase 3: Micro-Validation and User Checkpoints

At the end of **each batch**:
1. Inspect the diff to confirm it contains only approved changes.
2. Run project-level type-checking and linting.
3. Run relevant integration or behavior tests.
4. **Communicative Stop & Auto-Pilot Resolution:**
   - Check the environment state and `AGENTS.md`. 
   - **If Auto-Pilot is explicitly enabled globally (e.g., via CLI flag or AGENTS.md directives):** Proceed automatically to the next batch as long as validation checks (lint/types) pass with no new errors compared to the baseline.
   - **If Auto-Pilot is disabled or undefined:** You MUST halt execution entirely. Yield control back to the user without calling further tools. Do not pre-emptively start the next batch. Wait for the user to review the diff and send a confirmation command.
5. **Long-Refactor Handoff:** If the approved plan contains more than 3 batches, after the 3rd successful batch pause and offer a handoff checkpoint. Provide a summary suitable for a fresh session (completed batches, remaining plan, next steps). Suggest a checkpoint commit and a session restart, but let the user decide how to proceed.

## Phase 4: Behavior-Parity Checklist
Maintain a checklist of observable behaviors relevant to the refactor based on the target domain or manually provided context files. Mark each item as tested, manually checked, N/A, or unverified. Do not claim parity based solely on compilation.

## Phase 5: Failure Handling and Stop Conditions
- Isolate failures and fix only issues caused by the current batch (max 3 targeted repair iterations).
- If validation still fails, STOP, report the exact failure, and ask the user how to proceed.
- Do not automatically reset or overwrite files to recover. Preserve the current state.

## Phase 6: Completion and Documentation
At completion, report structural changes, validation results, and unverified parity items. Ask the user before modifying `AGENTS.md` if new architectural patterns were introduced.



<tagged_files>
* y:\projekte2026\website\remix_--portfolio_feed_editor_ver10\.agents\skills\deep-refactor\SKILL.md (52 lines)
</tagged_files>
