#!/usr/bin/env bash
# Seraphim PreToolUse token-discipline guard (Read + Bash).
#
# ENFORCES: the L1 orchestrator (main thread) must not flood its own context
# with large reads or bulk searches — it delegates those to subagents. This is
# the deterministic teeth behind that rule.
#
# HOW ORCHESTRATOR VS SUBAGENT IS DETECTED: the PreToolUse input carries
# `agent_id` ONLY when the hook fires inside a subagent call. So:
#   agent_id present  -> subagent (gatherer/builder/verifier/deep-reasoner) -> ALLOW everything
#   agent_id absent   -> main L1 thread -> enforce the limits below
set -uo pipefail

input=$(cat)

agent_id=$(jq -r '.agent_id // ""' <<<"$input" 2>/dev/null)
# Subagents do the heavy lifting and are never gated.
[[ -n "$agent_id" ]] && exit 0

tool=$(jq -r '.tool_name // ""' <<<"$input" 2>/dev/null)
MAX=25600   # 25 KB

deny() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

case "$tool" in
  Read)
    fp=$(jq -r '.tool_input.file_path // ""' <<<"$input" 2>/dev/null)
    lim=$(jq -r '.tool_input.limit // ""' <<<"$input" 2>/dev/null)
    # A bounded read (explicit limit) is always fine — it can't flood context.
    [[ -n "$lim" ]] && exit 0
    if [[ -f "$fp" ]]; then
      sz=$(wc -c <"$fp" 2>/dev/null || echo 0)
      if (( sz > MAX )); then
        deny "L1 token discipline: ${fp} is $((sz/1024))KB (> 25KB). Delegate this read to the gatherer subagent (Task -> gatherer) and consume its summary, or Read with an explicit limit/offset for a bounded slice. Subagents have no size limit."
      fi
    fi
    exit 0
    ;;

  Bash)
    cmd=$(jq -r '.tool_input.command // ""' <<<"$input" 2>/dev/null)
    has() { printf '%s' "$cmd" | grep -Eq "$1"; }

    # Recursive grep -> use the Grep tool (compact) or the gatherer.
    if has '(^|[[:space:];&|(])grep[[:space:]]+-[A-Za-z]*[rR]'; then
      deny "L1 token discipline: recursive grep floods orchestrator context. Use the Grep tool (returns compact results) or delegate to the gatherer subagent. Subagents may run it freely."
    fi
    # ripgrep is bulk/recursive by default -> Grep tool or gatherer.
    if has '(^|[[:space:];&|(])rg([[:space:]]|$)'; then
      deny "L1 token discipline: 'rg' is bulk-recursive. Use the Grep tool or delegate to the gatherer subagent."
    fi
    # find -> use the Glob tool or gatherer.
    if has '(^|[[:space:];&|(])find[[:space:]]'; then
      deny "L1 token discipline: 'find' floods orchestrator context. Use the Glob tool or delegate to the gatherer subagent."
    fi
    # Test suites -> builder/verifier subagents run these, not the orchestrator.
    if has '(npm|yarn|pnpm)[[:space:]]+(run[[:space:]]+)?test|(^|[[:space:];&|(])(jest|vitest|pytest|tox|phpunit|rspec)([[:space:]]|$)|go[[:space:]]+test|cargo[[:space:]]+test|(mvn|gradle)[[:space:]]+[^|]*test'; then
      deny "L1 token discipline: test suites flood orchestrator context. Delegate to the builder (to run its own change) or the verifier subagent."
    fi
    # git log -p / --patch dumps full patches.
    if has '(^|[[:space:];&|(])git[[:space:]]+log([[:space:]]|$)' && has '(-p([[:space:]]|$)|--patch)'; then
      deny "L1 token discipline: 'git log -p' dumps full patches. Use --oneline/--stat, or delegate to the verifier subagent."
    fi
    # Full git diff/show without a summary flag or a pathspec dumps a patch.
    if has '(^|[[:space:];&|(])git[[:space:]]+(diff|show)([[:space:]]|$)' \
       && ! has '(--stat|--numstat|--name-only|--name-status|--compact-summary|--shortstat|--quiet|--exit-code|--[[:space:]])'; then
      deny "L1 token discipline: a full 'git diff'/'git show' can flood context. Run it with --stat first, scope it to paths with '-- <path>', or delegate to the verifier/builder subagent."
    fi

    # Bulk cat/head/tail/less/more/bat: a glob, or any single arg over 25KB.
    if has '(^|[[:space:];&|(])(cat|head|tail|less|more|bat)([[:space:]]|$)'; then
      if has '\*'; then
        deny "L1 token discipline: bulk cat/head/tail over a glob floods context. Read specific files (with a limit) or delegate to the gatherer subagent."
      fi
      set -f  # disable pathname expansion while word-splitting the command
      for tok in $cmd; do
        [[ -f "$tok" ]] || continue
        sz=$(wc -c <"$tok" 2>/dev/null || echo 0)
        if (( sz > MAX )); then
          set +f
          deny "L1 token discipline: shelling out to read ${tok} ($((sz/1024))KB, > 25KB) bypasses the Read guard and floods context. Read it with an explicit limit or delegate to the gatherer subagent."
        fi
      done
      set +f
    fi

    exit 0
    ;;

  *)
    exit 0
    ;;
esac
