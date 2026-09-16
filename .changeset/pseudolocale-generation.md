---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add pseudolocale generation: a new `pseudolocalize` SDK entry point and a `verbatra pseudo` command that build a fake locale from the source strings alone, so layout truncation and untranslated hardcoded strings show up before any API key exists.

Every value is accented, expanded by roughly a third of its translatable length and wrapped in `[` and `]` boundary markers, while placeholders stay untouched in every syntax the shipped adapters recognise, including ICU plural and select arms, markup tags and escape sequences. Each generated value is held to the same integrity gate a provider translation must pass; one that would not pass it is copied from the source verbatim and reported rather than written broken.

The run constructs no provider, reads no API key and makes no network request. Output goes to `.verbatra-local/pseudo` by default, which the scaffolded ignore list already covers, and a pseudolocale that names a configured locale or would land on a configured locale file is refused, so `translate` never spends on it and `check` and `diff` never report it as drifted.
