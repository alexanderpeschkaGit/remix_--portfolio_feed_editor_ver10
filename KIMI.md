# Kimi Code Instructions

This repository uses `AGENTS.md` in the repository root as the canonical instruction file. Read and follow it before performing any task.
For workflow commands, read `.agents/WORKFLOWS.md` and then the referenced repository-local skill.

## Kimi Capability Translation

### `pro` subagent

When a rule requires a `pro` subagent, use the Kimi Code `Agent` tool with `subagent_type="coder"`. Supply the exact file paths, dependency list, and safeguards so its output meets the global decomposition and completeness standard.

### `flash` mode / `#flash`

When a rule references `flash` or `#flash`, read and apply `.agents/skills/flash.md`.

### `#grillme` interview

When a rule requires `#grillme`, read `.agents/skills/grillme.md` and resolve the relevant ambiguity before editing.

## RPM Limits and Multi-Agent Coordination

Kimi Code has a strict **3 Requests Per Minute** limit. Use small, accurate steps; pause at least 25 seconds between requests and before validation; run subagents sequentially; and after a `429` wait at least 30 seconds before retrying.

## Tooling Notes for This Environment

Kimi Code on this machine runs through Git Bash. The project’s `AGENTS.md` recommends PowerShell-native cmdlets for manual use, but Kimi Code’s file tools (`Read`, `Edit`, `Write`, `Glob`, `Grep`) and Bash tool are the preferred way to interact with the repository from this agent. Prefer the dedicated file tools over raw shell commands for file operations; use Bash only for shell semantics (npm, git, build runners) and observe the single-action protocol.
