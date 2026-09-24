---
"@verbatra/sdk": patch
---

Start a new Flutter ARB target file with `@@locale` and keep an existing `@@locale` first.

Previously a target file verbatra created had no `@@locale`, and a hand-added one kept whatever
position it had.

Now a new target file begins with `@@locale` set to the target locale in Flutter's underscore
spelling, such as `pt_BR`, and an existing `@@locale` keeps its value and is moved to the top on
every write. `BuildWriteTree` receives the written locale as a fourth argument.
