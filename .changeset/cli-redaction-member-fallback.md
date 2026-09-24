---
"@verbatra/cli": patch
---

Keep a DeepL key named by its JSON member scrubbed when the whole-document pass is dropped.

Previously, when scrubbing a whole `--json` document would have broken the JSON, the CLI kept the
value-by-value result, which missed a DeepL key recognised only by its member name, such as
`"auth_key":"<uuid>"`, and a member name never reached the strings of an array it held, such as
`"auth_key":["<uuid>"]`.

Now each string value is scrubbed together with its member name, including every string in an
array or nested array under that member, so that key is redacted on both paths.
