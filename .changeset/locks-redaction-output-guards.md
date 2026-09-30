---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Stale lock reclaim, bounded lock waits, context-aware redaction, and output path guards.

**Locks**
- A lock left by a dead process on the same machine, or one whose heartbeat stopped, is reclaimed
  instead of timing out. A holder never deletes another process's lock.
- An interrupted `translate` or `import`, and a force-stopped `watch`, release their locks. SDK:
  `releaseHeldLocks()`.
- `verbatra import --lock-timeout`, and `lockAcquireTimeoutMs` on `importWorkbook`, `editEntry`
  and `updateGlossaryTerm`, bound the wait.

**Redaction**
- Everything the CLI prints passes through `redact`, and the value of an `apiKeyEnvVar` is
  redacted everywhere (`declareProviderKeyEnvVar`).
- DeepL keys are recognized by context and `sk-` keys by length, so paths such as `sk-SK.json`
  stay readable. A config that fails to load no longer quotes its content.

**Output paths**
- `export` and `tmx export` refuse a path outside the project or onto a project file, and a
  failed write is a structured error that exits 2. `pseudo --out` also checks its path after
  resolving symbolic links.
