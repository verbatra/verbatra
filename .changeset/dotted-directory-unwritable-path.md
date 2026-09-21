---
"@verbatra/sdk": patch
---

Name an unwritable locale file relative to the working directory when it sits inside a directory
whose name merely begins with two dots.

A `TARGET_UNWRITABLE` message for a locale file under a directory such as `..locales` used to fall
back to the file's absolute path, as if the file sat outside the project. The same
working-directory check that guards the `verbatra types` and `verbatra pseudo` output paths now
decides this too, so only a path that really leaves the working directory is shown absolute.
