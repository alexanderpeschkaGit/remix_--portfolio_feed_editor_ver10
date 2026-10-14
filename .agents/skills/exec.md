---
name: exec
description: Implement steps from the most recent plan. Triggered when the user uses the `#exec` tag or `/exec` command.
---

# Exec Workflow

- Implement step `N` (passed as an argument or in the prompt) from the most recent plan in the current conversation.
- **Flash Execution Mode:** When implementing a plan with `Recommended Execution Model: FLASH`, delegate isolated/repetitive file edits to a `flash` subagent to save time, or execute directly with strict Single-Action Protocol.
- **Pro Swarm Execution (Red-Teaming):** When `Recommended Execution Model: PRO` is specified, or the task involves massive blast-radius changes, mandate a paired swarm execution. The Main Agent acts as the "Implementer" (to write the code), and then spawns a `pro` subagent as the "Reviewer" to actively audit the code *before* finalizing the turn.
- **Plan Continuity:** This refers strictly to plans present in the current conversation. Plans are not assumed to persist across unrelated sessions. For cross-session execution, the user must provide the plan again or explicitly authorize storing it as project documentation. If the referenced plan is unavailable or the requested step cannot be identified safely, ask for the plan instead of guessing.
- Apply the global preflight, scope, validation, and decision-gate contract in `AGENTS.md`; if new material ambiguity appears, pause and run `#grillme`.
- If `N` is `all`, implement all remaining steps in order without stopping for routine confirmations.
- Edit files directly rather than returning source code for manual copying.
- **Direct File Modification (No Code Blocks in Chat):** Apply all changes directly using file tools. Do NOT output code blocks, file headers, or source code in chat responses unless the user explicitly requests them.
- Preserve existing user changes and all protected behavior defined in project guidelines (like AGENTS.md if present).
- After every implemented step, check environment integrity, build configurations, and relevant platform behavior. Fix discovered regressions before continuing.
- Run the repository's relevant type-check, tests, or build when feasible and report the actual results.
- Stop for authorization only when an irreversible action, external side effect (e.g., `git push`, Cloudflare deployment), new authority, or material scope expansion is required.
- **Git & Checkpoint Policy (On Plan Completion):**
  - Execute automatically upon completing all planned steps (when `N` is `all` or the final plan step has finished):
  1. **Pre-Commit Verification:** Run type-check and linter (`npm run lint` or `npm run check`). If tests or type-checks fail, resolve them first or abort; never commit broken code. Ensure the patch version in `package.json` is incremented upon feature completion or code update.
  2. **Branch Check:** Prefer committing on development branches (`preview` or dedicated `feature/*`/`task/*` branches). If currently on `main` or `master`, output a clear warning, but do not hard-block if working directly on main or explicitly instructed.
  3. **Scope Inspection:** Run `git status --short` to inspect working tree status. If untracked or unexpected out-of-scope files exist, warn in the final summary, but proceed with staging only the explicitly planned files.
  4. **Explicit Staging:** Stage modified and planned files explicitly by relative path (`git add <file1> <file2>`). NEVER stage blindly with `git add .` or `git add -A`.
  5. **Conventional Commit:** Create an autonomous commit using Conventional Commits format (`type(scope): subject\n\nbody`) including a concise rationale in the commit body.
  6. **Remote Safety:** NEVER push automatically to remote (`git push` is an irreversible external action and a strict Hard Stop requiring explicit user instruction).
- **Final response:**
  - Summarize what changed and why in clear, concise bullet points.
  - List validation performed and any remaining risks.
  - Explicitly state the required refresh/deployment action needed from the user.
  - Do not reproduce source code or code blocks in the chat response.
