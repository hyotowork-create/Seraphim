#!/usr/bin/env bash
# Seraphim SessionStart preflight (advisory — SessionStart cannot block).
#
# Two jobs:
#   1. Warn loudly if an environment variable is set that would silently
#      override the pinned orchestrator model or a subagent's `model:`
#      frontmatter. Frontmatter is supposed to win; these env vars defeat it.
#   2. Confirm the session actually started on Fable (L1) and inject a short
#      operating reminder as additionalContext.
set -uo pipefail

input=$(cat)
model=$(jq -r '.model // ""' <<<"$input" 2>/dev/null)
source=$(jq -r '.source // ""' <<<"$input" 2>/dev/null)

warn=()
# Any of these, if set, can override the model chosen by settings.json or by a
# subagent's frontmatter. CLAUDE_CODE_SUBAGENT_MODEL is NOT a documented Claude
# Code variable, but if some wrapper injects it we still want to surface it.
for v in ANTHROPIC_MODEL CLAUDE_CODE_SUBAGENT_MODEL CLAUDE_CODE_MODEL CLAUDE_MODEL; do
  if [[ -n "${!v:-}" ]]; then
    warn+=("env $v=${!v} is set and can override the pinned model / subagent frontmatter")
  fi
done

note=""
case "$model" in
  claude-fable*|fable*) note="Started on Fable (L1) ✓" ;;
  "")                   note="harness did not report a model id" ;;
  *)                    warn+=("session model is '$model', not Fable — L1 orchestration expects Fable")
                        note="NOT on Fable (L1)" ;;
esac

if ((${#warn[@]})); then
  {
    echo "Seraphim preflight warnings:"
    printf '  - %s\n' "${warn[@]}"
  } >&2
fi

ctx="Seraphim L1 session start (source=${source:-?}). ${note}. \
Operating rules: (1) You are the L1 orchestrator — plan and synthesize, do NOT \
read large files or run recursive searches yourself; delegate them to the \
gatherer subagent (the token-guard hook enforces this on the main thread; \
subagents are unrestricted). (2) Delegate judgment to deep-reasoner (L2), \
implementation to builder (L3), collection to gatherer (L4), verification to \
verifier (L5). (3) Track work in .workflow/LEDGER.md; the Stop hook blocks \
ending the session while items are unchecked. (4) Effort target is 'high'; use \
/effort max only for the hardest sessions."

jq -n --arg c "$ctx" \
  '{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:$c}}'
exit 0
