---
name: refactor
description: Improve structure and maintainability without intentionally changing observable behavior. Triggered when the user uses the `#refactor` tag or `/refactor` command.
---

# Refactor Workflow

- Improve structure and maintainability without intentionally changing observable behavior.
- **Parallel Refactoring (Scatter-Gather):** When performing bulk edits across independent files, spawn multiple `flash` subagents concurrently. These subagents must ONLY perform read/edit file operations. They are strictly forbidden from running shell commands to prevent terminal lock contention. The main agent ("Coordinator") gathers the results and executes a single sequential type-check/build at the end.
- Inspect callers, shared types, state ownership, and platform-specific behavior before editing.
- Prefer focused extractions with clear responsibilities over broad rewrites.
- Edit files directly, then run relevant type-checks, tests, or builds.
- If preserving behavior is impossible or requirements conflict, stop and explain the required behavioral decision before proceeding.
- Summarize structural changes, validation, and any remaining risks without reproducing complete files.
