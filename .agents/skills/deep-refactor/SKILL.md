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

**Plan persistence (state-transfer safety):**
- Write the full approved plan — scope, batches, per-batch validation commands, parity checklist, and a `Docs Delta` section (see Phase 6) — verbatim to a plan file (e.g., `tmp/refactor-plan-<topic>.md`) BEFORE presenting it. This file is the single source of truth for Phase 2. It is a scratch artifact: do not commit it.
- Maintain the `Docs Delta` section continuously during execution: record every documentation-relevant change (moved paths, renamed components, changed constraints) as it is discovered, so it survives batch handoffs and session restarts.
- Never rely on the chat context surviving a model switch. Environments like Anti-Gravity may discard the context cache when the model changes; without the plan file, the executing model has no plan and will hallucinate.
- Maintain a companion scratch state file (e.g. `tmp/refactor-plan-<topic>-progress.md`) recording: completed batches with commit hashes, remaining work, tooling notes, and a copy-paste **handoff prompt** for a fresh session. Do not commit it.
- Commit after **each** successful batch (checkpoint commit). Git history is the state-transfer backbone across sessions and model switches — never rely on chat context alone.

**MANDATORY CHECKPOINT & MODEL HANDOFF:** 
- Stop generation immediately after presenting the plan. 
- Do NOT invoke file modification tools yet. 
- **Programmatic switch if available:** If the environment exposes a programmatic model-switch mechanism (tool call, MCP bridge, or CLI flag), use it to perform the handoff automatically instead of instructing the user. The text message below is the fallback for manual environments.
- Output this exact message: *"Plan complete. The full plan is saved at `[plan file path]`. If you are using a heavy reasoning model (e.g., DeepSeek V4 or Gemini Advanced), you may now switch to a faster coding model (e.g., 4.1-Flash or Gemini Flash) for the execution batches. Type 'GO' or enable Auto-Pilot to begin Phase 2."*
- **State-transfer safeguards:** Instruct the new model to read the plan file first, e.g. as its first prompt: "Read the plan at `[plan file path]` and execute it step by step." If the environment does not preserve chat state across the model switch (e.g., the context cache is discarded), the plan MUST instead be passed as a hard text snippet in the new model's first prompt: `"Execute this plan step by step: [Plan]"`. Never start Phase 2 without confirming that the executing model has the plan.

## Phase 2: Batch Design and Execution

Before executing any batch, reload the plan file written in Phase 1 and treat it as the sole source of truth. Do not reconstruct the plan from memory or from possibly-stale chat context.

### 1. Batch limits
- Change at most **3 implementation files per batch** as the default limit.
- If a coherent step requires more tightly coupled files that cannot be safely split, explain why and ask the user to approve a specifically scoped exception before editing.
- Count added, modified, moved, and deleted implementation files toward the limit.
- Keep formatting-only changes and unrelated bug fixes out of scope.

### 2. Model Routing per Batch
Classify every batch before execution and choose the executing model accordingly:
- **Use the fast model (e.g., 4.1-Flash or Gemini Flash) for structural batches:** file splitting, type/utility extraction, UI leaf extraction, CSS/Tailwind restructuring, mechanical renames and moves. These are plan-driven and mechanical; a fast model executes them reliably.
- **Switch back to the heavy reasoning model for algorithmic batches:** any batch that rewrites deep algorithmic logic — e.g., complex WebGL/matrix math, non-trivial sorting or search algorithms, state machines, or subtle async/race-condition code — must be executed by a heavy reasoning model. A fast model will fail on these even with a perfect plan.
- If a batch mixes structural and algorithmic changes, split it: extract the mechanical parts into one batch (fast model) and the algorithmic rewrite into its own batch (heavy model).
- Record the assigned model per batch in the plan file so the handoff target knows which model to use for which batch.

### 3. Refactor responsibilities & Code Integrity
- Extract code only when the new boundary has a clear responsibility and ownership contract.
- Do not create thin wrappers, duplicate state, or oversized parameter bags merely to shrink the original file.
- Keep state local unless multiple consumers genuinely need shared ownership.
- Custom hooks may own state, effects, and lifecycle behavior. They do not need to be pure, just focused.
- Put reusable pure logic in utilities and presentation in leaf components.
- **Environment-Aware Editing:** 
  - If the environment (like Anti-Gravity) provides a `search_replace` or diff-based tool, use it to target only the modified lines.
  - If you must write the full file (e.g. via `write_file`), you are STRICTLY FORBIDDEN from using lazy truncation (e.g., `// ... rest of code`, `// existing logic`). You must output the entire file content verbatim, maintaining exact parity for unmodified functions.
  - For very large files (roughly 500–1000+ lines) where a full-file rewrite is error-prone, prefer a **verbatim block-splice** with a structurally unambiguous anchor: extract the isolated block into a temporary file and inject it via a diff/patch CLI or AST-based tool (e.g. `ts-morph`) where the environment allows it. If text anchors are the only option, anchor on exact line numbers plus surrounding content re-read immediately before splicing — never on lookalike tokens such as closing braces, hook calls, or callback signatures. Reserve the full-file `write_file` path as a last resort.

### 4. Decomposition & Mega-file pipeline
Project-specific rules take precedence. If the repository's `AGENTS.md` requires decomposition at a lower threshold (e.g., 500+ lines) or mandates specific subagent models or a `#grillme` interview depending on complexity, follow those guidelines first. For exceptionally large files or when instructed, apply the following sequential pipeline. Do not perform a one-shot rewrite or recreate behavior from memory.
1. **Ownership:** Map state, refs, effects. Change ownership only where justified. Validate and pause.
2. **Behavioral logic:** Extract focused lifecycle or domain logic. Validate and pause.
3. **Presentation:** Extract specific UI into leaf components. Validate and pause.
4. **Orchestrator cutover:** Compose validated extractions into the final orchestrator. Complete parity checklist before moving legacy implementation to `backup_unused/`.

### 5. Delegation
- Follow `AGENTS.md` for required subagent delegation.
- Delegate only bounded work with clear file ownership and stop conditions.
- Do not delegate concurrent edits to shared or highly coupled files.

## Phase 3: Micro-Validation and User Checkpoints

At the end of **each batch**:
1. Inspect the diff to confirm it contains only approved changes.
2. Run project-level type-checking and scope linting to the changed files (e.g. `eslint <file1> <file2>`) to keep pre-existing warnings out of the agent's context; compare results against the recorded baseline.
3. Run relevant integration or behavior tests.
4. **Encoding & line-ending hygiene:** Normalize every touched file to the repository's declared line-ending and encoding conventions (see `AGENTS.md`) and scan the diff for encoding corruption (umlauts/diacritics, em-dash, emoji, special punctuation). A green lint/build does not prove byte-clean text — verify no mojibake was introduced before declaring the batch done.
5. **Docs Delta maintenance:** Write any documentation-relevant change discovered in this batch (moved paths, renamed components, changed architectural constraints, **and new conventions/patterns that emerged during the refactor — e.g. dependency-injection wiring or adapter/getter patterns for late-declared dependencies**) into the `Docs Delta` section of the plan file immediately. Do not defer this to Phase 6 — the record must survive handoffs and session restarts.
6. **Communicative Stop & Auto-Pilot Resolution:**
   - Check the environment state and `AGENTS.md`. 
   - **If Auto-Pilot is explicitly enabled globally (e.g., via CLI flag or AGENTS.md directives):** Proceed automatically to the next batch as long as validation checks (lint/types) pass with no new errors compared to the baseline.
   - **If Auto-Pilot is disabled or undefined:** You MUST halt execution entirely. Yield control back to the user without calling further tools. Do not pre-emptively start the next batch. Wait for the user to review the diff and send a confirmation command.
7. **Long-Refactor Handoff:** If the approved plan contains more than 3 batches, after the 3rd successful batch pause and offer a handoff checkpoint. Provide a summary suitable for a fresh session (completed batches, remaining plan, next steps). Suggest a checkpoint commit and a session restart, but let the user decide how to proceed. Make the per-batch checkpoint commit a hard requirement, and update the scratch state file's handoff prompt each batch so a fresh session can resume without re-reading chat history.

## Phase 4: Behavior-Parity Checklist
Maintain a checklist of observable behaviors relevant to the refactor based on the target domain or manually provided context files. Mark each item as tested, manually checked, N/A, or unverified. Do not claim parity based solely on compilation.

## Phase 5: Failure Handling and Stop Conditions
- Isolate failures and fix only issues caused by the current batch (max 3 targeted repair iterations).
- If validation still fails after 3 repair attempts, roll the batch back **scoped**: revert only the files touched by this batch to the last checkpoint commit (e.g. `git restore -- <batch files>`), then STOP, report the exact failure, and ask the user how to proceed. This restores a clean intermediate state so the next batch is not contaminated.
- The scoped rollback is allowed only because Phase 1 requires a committed baseline and per-batch checkpoint commits. Before reverting, verify via `git status` that the batch files contain no user changes beyond the batch itself; if they do, skip the rollback and ask the user instead. Never run global destructive commands (`git reset --hard`, checkout, clean) — they would destroy unrelated or uncommitted user work.

## Phase 6: Completion and Documentation

0. **Independent review (recommended):** Before declaring the refactor complete, run an independent reviewer subagent (code-review / red-team) over the final diff and only proceed once it reports no blocking findings. This catches cross-batch regressions that per-batch inspection and lint/build/test can miss.
1. **Final report:** Summarize structural changes, validation results, and unverified parity items. Do not reproduce complete files in chat.
2. **Documentation Sync Check (deterministic):** Review the `Docs Delta` section of the plan file and the final diff, then cross-check the results against the project documentation:
   - **`AGENTS.md` facts:** Architecture stack, storage conventions and canonical paths (e.g., `src/store/`, `src/hooks/`, `src/utils/`), file-size thresholds (300–499 warning / 500+ mandatory), dual-environment constraints, encoding rules, and delegation rules. Flag anything the refactor changed or invalidated.
   - **Applicable `.agents/rules/*.md` domain rules:** Only those whose topic the refactor touched. Flag references to moved/renamed files or changed behaviors.
   - **`.agents/WORKFLOWS.md` and skill files:** Only if workflows or skills were created, renamed, or modified.
   - Output a **Docs Delta list**: one entry per finding in the form `File → Section → proposed wording`, or explicitly "no update needed". Do not edit documentation at this stage.
3. **User gate (mandatory):** Present the Docs Delta list and explicitly ask the user which changes should be written into `AGENTS.md` or its `.agents/rules/` counterparts. Write them only after explicit user approval. Never modify `AGENTS.md` or rule files silently.
4. **Skill routing registration:** If the refactor introduced a new skill, register its trigger tag in `.agents/WORKFLOWS.md` as required by `AGENTS.md`.



<tagged_files>
* y:\projekte2026\website\remix_--portfolio_feed_editor_ver10\.agents\skills\deep-refactor\SKILL.md (52 lines)
</tagged_files>
