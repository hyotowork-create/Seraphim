# Run ledger

The L1 orchestrator records each unit of work here. The Stop hook
(`.claude/hooks/ledger-stop.sh`) refuses to end the session while any item is
still unchecked (`- [ ]`), so this stays an accurate, reproducible record.

- Mark an item done with `- [x]`.
- To drop an item, don't just delete it — annotate why (`- [x] ~~foo~~ cancelled: …`)
  so the record explains itself.
- One ledger per run; clear or archive it when you start fresh.

## Current run

_Started: (fill in) — Goal: (fill in)_

- [ ] Define the goal and success check for this run
- [ ] Delegate collection to gatherer (L4) / judgment to deep-reasoner (L2) as needed
- [ ] Implement via builder (L3)
- [ ] Verify via verifier (L5) — record CONFIRMED or the defect
- [ ] Summarize the outcome and clear this ledger
