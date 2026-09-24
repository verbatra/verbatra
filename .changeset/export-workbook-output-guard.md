---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Guard the `exportWorkbook` output path and wrap a failed write in a structured error.

Previously `exportWorkbook` and `verbatra export` wrote wherever `out` pointed, including outside
the working directory or onto a locale file, the lock file or the config file, and a failed write
surfaced as the raw file-system error.

Now an output path outside the working directory is refused, as is one that, or a file a `csv` or
`tsv` export would write into it, names a file the project depends on, before anything is read.
Symbolic links are resolved first, so a link cannot carry the handoff anywhere a plain path could
not. An `xlsx` path that names no file or names the working directory itself is refused too.
`EXPORT_OUTPUT_CONFLICT` and `EXPORT_UNWRITABLE` are new `SdkErrorCode` members for the refusal
and a failed write, and the CLI reports both as a structured error that exits `2`.
`ExportWorkbookInput.configPath` and `ExportWorkbookInput.glossaryPath` are new, so the loaded
config file and a file-backed glossary are protected under any name.
