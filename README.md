# Seraphim

A drop-in `.claude/` package that runs Claude Code as a **five-layer model
hierarchy** with deterministic guard rails — not just a suggested workflow.

| Layer | Role | Model | Lives in |
|-------|------|-------|----------|
| **L1** | Orchestrate · plan · synthesize | Fable | the main session |
| **L2** | Judgment · hard reasoning | Opus | `.claude/agents/deep-reasoner.md` |
| **L3** | Implementation | Sonnet | `.claude/agents/builder.md` |
| **L4** | Collection · recon | Haiku | `.claude/agents/gatherer.md` |
| **L5** | Verification | Opus | `.claude/agents/verifier.md` |

The operating doctrine is in [`CLAUDE.md`](./CLAUDE.md).

## What makes the layering real (not "hoped")

Four things are enforced deterministically instead of relying on the model to
behave:

1. **Reroute is visible.** A silent Fable→Opus reroute under load fires no hook
   and no env var, so the **status line** (`.claude/statusline.sh`) reads the
   live model each turn and shows `[!] REROUTED` when the main session isn't on
   Fable. That's the only surface that can catch it.
2. **No env landmines.** Subagent models are pinned by each agent's `model:`
   frontmatter. The `SessionStart` preflight warns if `ANTHROPIC_MODEL` /
   `CLAUDE_CODE_MODEL` / similar is set and could override that.
3. **Token discipline is enforced.** The `PreToolUse` guard
   (`.claude/hooks/token-guard.sh`) blocks the **L1 main thread** from reads
   >25 KB, `grep -r`/`rg`, `find`, test suites, and full `git diff`/`git log -p`,
   and tells it to delegate to a subagent. Subagents (detected via the
   `agent_id` field) are unrestricted.
4. **Runs are reproducible.** The `Stop` hook (`.claude/hooks/ledger-stop.sh`)
   refuses to end the session while `.workflow/LEDGER.md` has unchecked items,
   with a built-in loop guard so it can never trap you.

## Two corrections baked in

- **Effort default is `high`, not `max`.** Set via `effortLevel` in
  `.claude/settings.json`; use `/effort max` only for the hardest sessions.
- **Codex is not a native layer.** It's an optional external second opinion,
  shipped disabled as an opt-in MCP stub (`.claude/mcp/codex.example.json`).

## Install (4 steps)

1. **Copy** `.claude/`, `CLAUDE.md`, and `.workflow/` into your project root
   (already here if you cloned this repo).
2. **Update** Claude Code so Fable is selectable and the hook/statusline schema
   matches: `claude update` (use a recent v2.1.x).
3. **Start on L1:** the pinned `"model": "fable"` in `.claude/settings.json`
   starts the main session on Fable; if your build needs it, run `/model fable`.
   Effort is already `high`.
4. **Confirm** the status line reads `L1:Fable ✓`. If it shows `[!] REROUTED`,
   you're not on Fable — restart or accept the fallback deliberately.

### Requirements & notes

- `jq` and `bash` must be on `PATH` (the hooks and status line use them).
- The hook scripts must stay executable (`chmod +x .claude/hooks/*.sh
  .claude/statusline.sh`).
- **Windows:** if `${CLAUDE_PROJECT_DIR}` isn't expanded in `settings.json`,
  replace it with an absolute path, and run the scripts under Git Bash / WSL.
- Don't have Fable access, or want a different orchestrator model? Change
  `"model"` in `.claude/settings.json` and `EXPECTED_PREFIX` in
  `.claude/statusline.sh` to match.
