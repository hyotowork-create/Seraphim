# Seraphim — operating doctrine

Seraphim is a five-layer model hierarchy. The **main session is always L1**; the
other layers are subagents in `.claude/agents/`, each pinned to its model by
frontmatter (not by any env var — env model overrides are a trap this package
warns about at session start).

## The five layers

| Layer | Role         | Model  | Where               | Does NOT                         |
|-------|--------------|--------|---------------------|----------------------------------|
| L1    | Orchestrate / plan / synthesize | Fable  | this main session   | read large files, run bulk search, run test suites |
| L2    | Judgment / hard reasoning       | Opus   | `deep-reasoner`     | write code (read-only)           |
| L3    | Implementation                  | Sonnet | `builder`           | expand scope beyond its spec     |
| L4    | Collection / recon              | Haiku  | `gatherer`          | return raw dumps (summarize)     |
| L5    | Verification                    | Opus   | `verifier`          | fix things (reports only)        |

L1 is the only layer that talks to the user. It decides, delegates, and stitches
results together. It should stay light on context.

## Delegation rules (enforced, not hoped)

- **L1 never does heavy I/O itself.** Large reads (>25KB), `grep -r`/`rg`,
  `find`, test suites, and full `git diff`/`git log -p` are **blocked on the
  main thread** by `.claude/hooks/token-guard.sh`. Delegate them:
  - reconnaissance / bulk reads / searches → **gatherer** (L4)
  - a concrete change → **builder** (L3)
  - a hard call or plan review → **deep-reasoner** (L2)
  - checking a finished change → **verifier** (L5)
- Subagents are **unrestricted** — the guard detects them via the `agent_id`
  field and steps aside. So the heavy work happens where context is disposable.
- Use the Grep/Glob tools (compact) for the L1 thread's own small lookups; the
  guard leaves those alone.

## Reproducibility

Every non-trivial run is tracked in `.workflow/LEDGER.md`. The Stop hook
(`ledger-stop.sh`) blocks ending the session while items are unchecked, so a run
is never left half-recorded. It has a loop guard: after a few reminders against
an unchanged ledger it relents and warns instead of trapping you.

## Effort

Default effort is **high** (`effortLevel` in settings). Reserve `/effort max`
for the hardest sessions. L2 deep-reasoner and per-agent frontmatter can raise
effort locally.

## Reroute awareness

A silent Fable→Opus reroute under load fires no hook and no env var — the
**status line is the only place it shows**. If the bar reads `[!] REROUTED`
instead of `L1:Fable ✓`, you are not on the model you think you are; decide
whether to continue or restart the session.

## Codex second opinion (optional, off by default)

Codex is **not** a native Seraphim layer. It is an optional external
second-opinion tool wired as an opt-in MCP server. It ships disabled; see
`.claude/mcp/codex.example.json` to enable it deliberately.
