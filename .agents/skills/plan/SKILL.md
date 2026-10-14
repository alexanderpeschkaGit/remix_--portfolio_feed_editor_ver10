---
name: plan
description: Inspect the relevant repository context and create a detailed plan before proposing changes. Triggered when the user uses the `#plan` tag or `/plan` command.
---

# Plan Workflow

- Inspect the relevant repository context before proposing changes.
- Do not modify files or execute state-changing actions.
- Follow the global preflight, scope, and decision-gate contract in `AGENTS.md`.
- **Interactive Ambiguity Check (Auto-Grill):** If any part of the request or requirements contains unresolved architecture/logic choices, high-risk trade-offs, or open dependencies, trigger the `/grillme` workflow first. Interview the user using indexed/sequential questions to resolve open choices before rendering the final plan.
- **Mandatory Execution Metadata Header:** Every generated plan (whether written to a file or output in chat) MUST start with this exact markdown block at the very top:

  ```markdown
  ## Execution Metadata

  - **Recommended Execution Model:** [FLASH | PRO]
  - **Complexity Assessment:** [Short rationale, e.g. "Standard UI component update" vs "Complex cross-file state refactor"]
  ```
  - **Model Recommendation Rules:** Recommend **PRO** for high-risk, complex, or blast-radius heavy tasks. Recommend **FLASH** for low-risk, repetitive, or isolated tasks.
  - **Advise the Executor:** If recommending `PRO`, the plan MUST explicitly advise the `#exec` agent to act as the Implementer and spawn a `pro` Reviewer subagent (Red-Teaming) before finalizing.

- **Mandatory Output Structure:** After the Metadata Header, you MUST strictly follow this 5-step structure, adapting to the language of the user's prompt (e.g., English for English prompts, German for German prompts):
  1. **Architecture & Logic (Architektur & Logik):** Create a logical step-by-step architecture compatible with the project constraints. For non-trivial work, include the global preflight findings, assumptions, gaps, fallbacks, and exit conditions. For state-changing plans (involving file modifications), the final planned step MUST explicitly define the validation and checkpoint commit adhering to the Git & Checkpoint Policy (Step 5). For read-only/investigative plans without code changes, conclude with the analytical findings or recommendations.
  2. **File Inventory (Datei-Inventar):** List all affected files with their relative paths. Whenever an orchestrator component, hook, or pipeline listed in `.agents/rules/app-architecture.md` (or other rule file in `.agents/rules/`) is refactored, the plan generator must automatically append the relevant rule file to the plan's File Inventory (e.g. `Batch N: Sync .agents/rules/app-architecture.md`).
  3. **Risk & Complexity Check (Risiko- & Komplexitäts-Check):** Evaluate the complexity on a scale of 1-10 for a) each individual task, b) the combined execution. If any single value OR the total value > 6, explicitly recommend switching to a PRO model for execution.
  4. **Optimization/Combination Hint (Optimierungshinweis):** Check if individual tasks can be combined in a way that their joint complexity remains manageable (< 7). Provide a concrete recommendation for these step combinations.
  5. **Git & Checkpoint Policy (Git- & Checkpoint-Leitfaden):** Explicitly list the validation and commit guidelines for the executor:
     - **Pre-Commit Verification:** Run type-check/linter (`npm run lint` or `npm run check`); fix any failures before committing. Increment patch version in `package.json` on code updates.
     - **Branch Check:** Prefer committing on development branches (`preview` or dedicated `feature/*`/`task/*` branches). If on `main`/`master`, issue a clear warning, but do not hard-block if working directly on main or explicitly authorized.
     - **Scope Inspection:** Check `git status --short`. If untracked or unrelated files exist, warn in the summary, but proceed without staging foreign files.
     - **Path-Specific Staging:** Stage modified files explicitly by relative path (NEVER blind `git add .`).
     - **Commit Format:** Conventional Commits with a concise rationale in the commit body.
     - **Remote Safety:** NEVER push automatically to remote (`git push` is a strict Hard Stop requiring explicit user instruction).

- Describe the implementation strategy, affected files, dependencies, validation, and meaningful risks.
- Keep the plan concrete enough that an implementation turn can follow it without rediscovering the design.
- Avoid code-level rewrites and fenced code blocks unless the user explicitly asks for them.
- Do not force a confirmation question when the user requested only a plan and all context is already clear, but naturally ask the user how they would like to proceed based on the plan.
