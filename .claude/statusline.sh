#!/usr/bin/env bash
# Seraphim L1 status line.
#
# WHY THIS EXISTS: a mid-session model reroute (Fable -> Opus under capacity
# pressure) is silent — no hook and no env var fires for it, so the status line
# is the ONLY surface that can expose it. This reads the live model id that
# Claude Code reports each turn and screams if it is not the L1 orchestrator
# model (Fable). Everything else (effort, dir, branch, context %) is context.
set -uo pipefail

input=$(cat)
j() { jq -r "$1" <<<"$input" 2>/dev/null; }

model_id=$(j '.model.id // ""')
model_name=$(j '.model.display_name // "?"')
pct=$(j '.context_window.used_percentage // 0' | cut -d. -f1)
proj=$(j '.workspace.project_dir // .cwd // ""')
cur=$(j '.workspace.current_dir // .cwd // ""')

# The configured L1 orchestrator model family. Full ids look like claude-fable-5.
EXPECTED_PREFIX="claude-fable"

# Effort target, read from the project settings so the bar reflects reality.
effort="?"
if [[ -n "$proj" && -f "$proj/.claude/settings.json" ]]; then
  effort=$(jq -r '.effortLevel // .env.CLAUDE_CODE_EFFORT_LEVEL // "?"' \
    "$proj/.claude/settings.json" 2>/dev/null || echo "?")
fi

# Git branch (best effort).
branch=""
if git -C "$cur" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  branch=$(git -C "$cur" branch --show-current 2>/dev/null)
fi

dir="${cur##*/}"

if [[ "$model_id" == ${EXPECTED_PREFIX}* ]]; then
  lead="L1:${model_name} ✓"
elif [[ -z "$model_id" ]]; then
  lead="L1:? (model not reported)"
else
  lead="[!] REROUTED -> ${model_name} (expected Fable/L1)"
fi

# printf %b renders the \u escape in $lead.
printf '%b  ⚡%s  \U0001F4C1 %s' "$lead" "$effort" "$dir"
[[ -n "$branch" ]] && printf '  ⎇ %s' "$branch"
printf '  ▐ %s%% ctx\n' "$pct"
