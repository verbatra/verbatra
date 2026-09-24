---
"@verbatra/cli": patch
---

Polish the `init`, `translate`, and `watch` output.

`init` now scaffolds the chosen format's usual file pattern and locale style when nothing is
detected (for example `locales/{locale}.yml` for YAML or `app/src/main/res/{locale}/strings.xml`
with the `android` style), reports each usage error once, refuses an empty flag value such as
`--targets ''` instead of taking the default, keeps no TODO for a format accepted at the prompt,
and rewrites its own `.env.example` header when `--force` switches provider.

`translate` lists each integrity-withheld key with its reason, including for a locale where every
key was refused, counts `1 key in 1 request` in the singular, reports a human-only estimate as
spending nothing rather than as self-hosted, and no longer suggests `--include-human` for pinned
keys or after `--include-human` was passed. `watch` announces the initial translation only after
startup checks pass.
