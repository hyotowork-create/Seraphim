# .workflow/

Reproducibility state for Seraphim runs.

- **`LEDGER.md`** — the live checklist for the current run. The Stop hook blocks
  ending the session while any `- [ ]` item remains. Edit it as you go.
- **`.stop-guard`** — transient loop-guard state written by the Stop hook
  (`count:ledger-hash`). Auto-created, auto-deleted, git-ignored. Do not edit.

The gate exists so a golden-set / A-B experiment run can't be abandoned
half-recorded — the ledger is the record of what actually happened.
