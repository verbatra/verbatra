---
"@verbatra/sdk": minor
---

Report why the integrity gate withheld each key, and tidy several run messages.

A `translate` or `watch` run listed withheld keys in `integrityMismatches` without saying why. Each
locale now also carries `integrityRefusals`, one entry per withheld key with its gate reason and,
where the check can name them, the placeholders, tags, or ICU plural arms at fault.

A later locale of a budget-stopped run no longer claims the run "reached" a budget it stopped short
of, a one-key sub-batch failure reads `1 entry`, `watch` no longer suggests `--dry-run` for a budget
and concurrency conflict, and a config issue raised twice is reported once.
