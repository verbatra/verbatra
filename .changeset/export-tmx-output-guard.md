---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Guard the `exportTmx` output path and wrap a failed write in a structured error.

Previously `exportTmx` and `verbatra tmx export` wrote wherever `out` pointed, including outside the
working directory or onto a locale file, the lock file, the translation-memory cache or the config
file, and a failed write surfaced as the raw file-system error. Such a path is now refused with
`TMX_OUTPUT_CONFLICT` before the memory is read, a failed write throws `TMX_UNWRITABLE` naming the
file and the file-system code, and the CLI reports both as a structured error that exits `2`.
`exportTmx` accepts a `configPath` so the loaded config file is protected under any name.
