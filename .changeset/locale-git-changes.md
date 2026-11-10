---
"@verbatra/sdk": minor
---

See which locale files changed in git, and what changed in each, with `localeGitStatus` and `localeGitDiff`.

- **What you get:** `localeGitStatus({ config })` lists the locale, lock and provenance files that differ from the last commit, and `localeGitDiff({ config, locale })` lists the keys added, removed and changed in one locale. A missing or unusable git comes back as `available: false` with a reason instead of throwing.
- **Security fix in `localeHistory`:** git now runs without a shell and with a minimal environment, never inherits `GIT_*` variables, never opens a bare repository planted in the project folder and never fetches from a promisor remote.
- **Upgrade:** `localeHistory` now answers `dubious-ownership`, `bare-repository`, `unsafe-config` or `git-too-old` with `available: false` where it used to read as an empty history.
