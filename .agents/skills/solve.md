---
name: solve
description: Plans a solution and immediately delegates the execution to a subagent. Triggered by #solve or /solve.
---

# Solve Workflow (Plan & Delegate)

- **Purpose:** To automatically investigate an issue, write a concrete execution plan to an artifact, and spawn an isolated subagent to execute it.

- **Step 1: Investigate and Plan**
  - Inspect the relevant repository context and files to understand the request.
  - Determine the exact files to modify and the logic to change.
  - Follow the global preflight and decision gate in `AGENTS.md`; resolve material ambiguity through `#grillme` before creating an artifact or delegating execution.
  
- **Step 2: Create the Context Artifact**
  - Write the step-by-step implementation instructions into a Markdown Artifact using the `write_to_file` tool.
  - Set `RequestFeedback: false` so that the workflow does not pause. The artifact is strictly for the subagent and the user's reference.
  - For non-trivial work, include the global preflight findings, validation plan, and scope-limited improvement recommendations.

- **Step 3: Spawn the Subagent (Delegate)**
  - Immediately after creating the artifact, use the `invoke_subagent` tool.
  - **Model:** Default to `inherit` (so it matches the parent session). *Note: The model can be explicitly overridden by the user prompt (e.g., "use flash" or "use pro").*
  - **Role:** `Artifact Executor`
  - **Prompt:** "Read the execution plan located at `[Absolute Path to Artifact]` and implement all steps thoroughly. Do not stop until all steps are complete."

- **Step 4: Handoff**
  - Inform the user that the plan artifact has been generated and the subagent is running in the background.
  - Provide a clickable link to the subagent's isolated session using the exact format: `[View Subagent Stream](conversation://<subagent-conversation-id>)`.
  - Stop calling tools and wait for the subagent to report back.
