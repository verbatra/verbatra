---
"@verbatra/sdk": minor
---

Report finer-grained progress from `translate`, `watch`, `extract`, `diff` and `doctor`.

Previously `onProgress` fired only when a locale started or finished, before each batch and at the
end of the run, so a long provider call, a retry, a repair round or a file write gave no sign of
life, and the source scans reported nothing.

Now `onProgress` also receives `locale-planned`, `batch-finished` (with its duration and usage),
`provider-retry`, `repair`, `split-retry` and `writing`, and `watch` adds `change-detected` and
`idle`. `extract`, `diff` with `unused` and `doctor` with `literals` take an `onProgress` that
receives `files-scanned`. A custom `CreateProvider` gets a third `CreateProviderHooks` argument
whose `onRetry` feeds `provider-retry`. The CLI's `--json` progress records are unchanged.
