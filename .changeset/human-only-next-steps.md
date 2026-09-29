---
"@verbatra/cli": patch
---

Point the next steps of a `provider: none` project at the human handoff.

Previously `check`, `diff` and `translate --dry-run` suggested `verbatra translate` even when
machine translation is disabled by policy, where a run cannot fill a key. Under
`provider: { id: "none" }`, `check`'s out-of-sync line and `diff`'s hint now point at
`verbatra export` and Verbatra Studio, and a dry run with nothing to fill suggests `verbatra check`
instead of a real run.
