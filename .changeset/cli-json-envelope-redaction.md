---
"@verbatra/cli": patch
---

Keep the `--json` envelope valid JSON when a key value is redacted from it.

Previously the envelope was scrubbed as serialized text, so a configured key value containing a
`"` or a `\` could remove part of the JSON syntax along with the key and leave output that no
longer parsed.

Now a compact JSON document written by the CLI is scrubbed value by value before it is serialized
again, so a redacted envelope always parses. Other output is scrubbed as text, as before.
