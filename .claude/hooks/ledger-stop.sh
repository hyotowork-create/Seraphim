#!/usr/bin/env bash
# Seraphim Stop hook: reproducibility gate.
#
# Blocks the L1 session from ending while .workflow/LEDGER.md still has unchecked
# items ("- [ ]"). This keeps a run's record complete so it can be reproduced /
# audited. Only the MAIN thread is gated: for subagents Claude Code converts Stop
# into SubagentStop (a different event we do not register), so subagents finish
# normally.
#
# LOOP GUARD: there is no documented stop_hook_active field, so we implement our
# own. We count consecutive blocks against an unchanged ledger; after LIMIT we
# stop insisting (and warn) so we can never trap the session in an infinite
# block loop.
set -uo pipefail

input=$(cat)
proj="${CLAUDE_PROJECT_DIR:-$(jq -r '.cwd // "."' <<<"$input" 2>/dev/null)}"
ledger="$proj/.workflow/LEDGER.md"
guard="$proj/.workflow/.stop-guard"
LIMIT=4

# Nothing to enforce if there is no ledger.
[[ -f "$ledger" ]] || exit 0

open=$(grep -cE '^[[:space:]]*[-*][[:space:]]+\[[[:space:]]\]' "$ledger" 2>/dev/null)
open=${open:-0}

if (( open == 0 )); then
  rm -f "$guard"
  exit 0
fi

hash=$(sha1sum "$ledger" 2>/dev/null | awk '{print $1}')
pcount=0; phash=""
if [[ -f "$guard" ]]; then
  IFS=':' read -r pcount phash <"$guard" || true
fi
[[ "$pcount" =~ ^[0-9]+$ ]] || pcount=0
# Reset the counter whenever the ledger content changes (progress is being made).
[[ "$phash" == "$hash" ]] || pcount=0
count=$((pcount + 1))

if (( count > LIMIT )); then
  # Loop guard tripped: allow the stop, but make the unfinished state loud.
  rm -f "$guard"
  jq -n --arg m "Seraphim: .workflow/LEDGER.md still has ${open} open item(s) after ${LIMIT} reminders — allowing the session to end to avoid a block loop. This run is NOT fully recorded; reconcile the ledger before trusting the results." \
    '{systemMessage:$m}'
  exit 0
fi

printf '%s:%s\n' "$count" "$hash" >"$guard"
reason="Seraphim reproducibility gate: .workflow/LEDGER.md has ${open} unchecked item(s) ('- [ ]'). Before ending, either complete them (mark '- [x]') or explicitly cancel them (strike through / annotate why), so the run is reproducible. Reminder ${count}/${LIMIT}."
jq -n --arg r "$reason" '{decision:"block", reason:$r}'
exit 0
