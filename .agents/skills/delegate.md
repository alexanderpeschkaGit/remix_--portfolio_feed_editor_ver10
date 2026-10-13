---
name: delegate
description: Writes a focused execution plan to an Artifact and spawns a subagent to execute it from the file, preventing context bloat. Triggered by #delegate, /delegate, #deligate, or /deligate.
---

# Delegate Workflow

- **Purpose:** To prevent conversation bloat by giving a subagent a pristine, noise-free instruction set. This is the programmatic equivalent of starting a brand new chat just for execution.
- **Step 1: Create the Context Artifact:**
  - Write the exact step-by-step implementation instructions, file paths, and required context into a Markdown Artifact using the `write_to_file` tool.
  - You MUST provide `ArtifactMetadata` when creating this file.
  - You MUST set `RequestFeedback: false` so that the workflow does not pause. The artifact is strictly for the user's visual reference.
- **Step 2: Spawn the Subagent:**
  - Immediately after creating the artifact, use the `invoke_subagent` tool.
  - **Model:** Default to `pro`. However, if the user's prompt contains the word `flash` (with or without a `#`), invoke the subagent using the `flash` model.
  - **Role:** `Artifact Executor`
  - **Prompt:** Keep the prompt extremely minimal. Do NOT pass the plan inline. Example: *"Read the execution plan located at `[Absolute Path to Artifact]` and implement all steps thoroughly. Do not stop until all steps are complete."*
- **Step 3: Handoff:**
  - Inform the user that the artifact has been generated and the subagent is currently running in the background. Stop calling tools and wait for the subagent to report back.
