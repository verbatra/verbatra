# Values redacted

An operator who wants translation content kept out of the agent's context
starts the server with `verbatra mcp --redact-values` (or `verbatra-mcp
--redact-values`, or `VERBATRA_MCP_REDACT_VALUES` set to `1`, `true`, `yes` or
`on`). `project.snapshot` then reports `valuesRedacted: true`, and the server's
`instructions` say so too.

- Every source text, translation, description and glossary term in a result is
  replaced by a marker such as `[redacted length=12 hash=3f9a0c1d2e4b5a6c]`, and
  reviewer and author names are left out. `history.keyRevisions` goes
  further: each revision's `value` is a marker, and its `diff`, `author` and
  `subject` are left out (a subject can quote a value), as is the `diff` of
  `workingTree`; commits, dates, `origin` and `sourceChanged` stay. Equal
  values share a hash, but only until the server stops. An error message that can carry values, such as a
  config, glossary or file error, is replaced whole by one marker; its code and
  `Next step:` line stay. Key names, counts, statuses, origins, integrity verdicts, commit
  subjects from `history.list`, and paths are not redacted. A `history.list`
  subject can quote a translation and still reaches you under this mode: it is
  scrubbed for API keys like everywhere else, which is not value redaction. When
  translation content must stay out of your context, do not call `history.list`.
- `review.approve` and `review.reject` take the marker's 16-character hexadecimal hash as
  `expectedHash` and refuse `expectedValue`. Relay the hash of the value the user
  reviewed; a changed value is still refused with `REVIEW_VALUE_CHANGED`.
- `locale.values` refuses `query` and `key.context` refuses `draft`, as invalid
  input naming the field: leave them out. `glossary.write` answers with
  empty `terms` and `doNotTranslate` lists and the counts `termCount` and
  `doNotTranslateCount`, not the terms.
- `translation.editEntry` still writes. A marker is not the text: never send one
  to `translation.editEntry` or `glossary.write`.
- The spend tools still need `--allow-spend`, and a provider still receives the
  real text.

Do not try to work out a redacted value from lengths, hashes, glossary hits or
repeated writes. The mode keeps values out of results; it does not stop an agent
that probes on purpose, so not probing is your part of it. Report keys and
statuses instead. Without the mode, `valuesRedacted` is false and the values come
back in full, except that `history.keyRevisions` (values, diffs, subjects and
authors) and `history.list` (subjects and authors) replace text they recognise as an
API key, or that equals a configured key value, with `[REDACTED]` (see
[RESULTS.md](RESULTS.md)), so what they return is not always the stored text, and a
key they do not recognise is not replaced.

`verbatra mcp --redact-values` refuses to start, with exit `2` and
`REDACTION_UNSUPPORTED`, when the installed `@verbatra/mcp` is too old to confirm
that it redacts. That is the operator's upgrade, not something to work around by
dropping the flag.
