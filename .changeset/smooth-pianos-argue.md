---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add source string extraction: a new `extract` entry point and `verbatra extract` command that scan
your application source for i18next translation call sites and add the keys they find to the source
locale catalog, so verbatra now works on a project that has no catalog yet.

The run spends nothing: it constructs no provider, reads no API key environment variable, and makes
no network request. Only the source locale file is written, and only genuinely new keys are added,
so a value already in the catalog is never overwritten. A run that finds nothing new writes nothing
at all.

Configure it with a new optional `extract` block naming the framework and the source roots. A call
site whose key is not a static string, a key found with two conflicting defaults, and a file that
could not be read are all reported in the result rather than guessed at or thrown. `--dry-run`
previews the additions and `--json` prints the usual envelope.

A namespace-qualified key such as `t("common:nav.home")` is reported as dynamic and never written:
one config addresses one catalog file, so a project that spells a namespace at every call site gets
a run that adds nothing. That limit is the first thing to lift once multi-namespace projects are
supported.

`SdkFs` gains an optional `readDirectory` member, which is what the scan discovers source files
through. It is optional, so an existing `deps.fs` implementation keeps working; `extract` reports a
file system without it as `EXTRACT_FS_UNSUPPORTED`.
