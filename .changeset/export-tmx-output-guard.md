---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Guard the `exportTmx` output path and wrap a failed write in a structured error.

Previously `exportTmx` and `verbatra tmx export` wrote wherever `out` pointed, including outside the
working directory or onto a locale file, the lock file, the translation-memory cache or the config
file, and a failed write surfaced as the raw file-system error. An output path outside the working
directory is now refused, as are one that names no file or ends in a path separator and one naming
a file the project depends on, before the memory is read. `TMX_OUTPUT_CONFLICT` and
`TMX_UNWRITABLE` are new `SdkErrorCode` members for the refusal and a failed write, and the CLI
reports both as a structured error that exits `2`. `ExportTmxInput.configPath` is new, so the
loaded config file is protected under any name.

The output guards of `exportTmx` and `generateTypes` now also refuse the file-backed glossary
(`glossaryPath`, new on both inputs) and resolve symbolic links through the new optional
`SdkFs.realpath`, so a linked directory cannot carry an output outside the working directory or
onto a protected file. `TYPES_UNWRITABLE` now names the file relative to the working directory and
the file-system code.
