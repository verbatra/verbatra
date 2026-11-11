---
"@verbatra/cli": patch
---

`verbatra translate --estimate` now ends with "estimate done in ..., nothing written" instead of the dry-run wording.

- **Upgrade:** an `--estimate` run used to end with the dry-run wording ("dry run done in ..., nothing written") and now ends with "estimate done in ..., nothing written". A script that matches the old closing line should match the new one, or read `--json`.
