---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Read and write the translation memory as TMX, the interchange format every mainstream translation
platform can produce and consume: `verbatra tmx import <file>` and `verbatra tmx export [file]`,
`importTmx` and `exportTmx` from the SDK. A team arriving with years of accumulated memory no
longer starts cold, and a team leaving can take theirs.

Both directions are keyless and cost nothing. Neither constructs a provider, reads an API key, nor
makes a network call: every value comes from the file or from the memory already on disk.

An imported file is untrusted third-party XML and is treated as such. Its size is bounded before
the parser sees it; entity declarations and internal DTD subsets are refused outright, so neither
an external entity reference nor an unbounded expansion can be reached; the bare external doctype
that real writers emit is discarded rather than fetched; and unit, language and segment-length
bounds are enforced during the walk. Every refusal is a structured `ExchangeError` naming what
failed, never a raw parser error and never a hang.

Nothing lands in the memory unchecked. Every candidate translation passes the same placeholder,
ICU, degeneracy and emptiness gate that provider output and a filled translator handoff already
face, enforced where the record enters the store rather than left to the run that later reads it,
so a record that was never validated can never be served as a reuse. A unit whose source segment is
blank identifies no string and is refused. Inline markup is flattened to its text, which the
placeholder check then catches if the markup carried anything that mattered. Every refusal, skip
and flattening is counted and reported.

A language tag resolves to a configured locale by an explicit rule: the exact spelling wins after
lowercasing and folding underscores to hyphens, so `pt_BR`, `pt-br` and `pt-BR` are one locale;
failing that, the single configured locale sharing the tag's primary subtag, so a file written in
`en-US` lands in a project configured for `en`; and a tag that two configured locales could equally
claim is reported rather than guessed at. Tags matching nothing configured are counted per tag.

Imported units are stored under the project's current configuration fingerprint, the same key a
real run writes, so an imported memory is reused exactly when the configuration that would consume
it matches and stops matching when the provider, model, tone or glossary changes. Where an imported
unit disagrees with a translation the project already holds, the project's own translation wins and
the imported one is counted as kept; `--overwrite` reverses that. Importing the same file twice
therefore changes nothing the second time and writes no file at all.

Export writes one `tu` per distinct source string with the source segment and one target segment
per exported locale, escaping segment text so markup inside a value stays data and a carriage
return survives a reader's line-ending normalization. An empty memory produces a valid, empty TMX
file rather than an error. The cache schema is unchanged: export reads the source text the memory
already stores beside each entry, and an entry carried forward from a cache written before that
block existed is left out and counted rather than written without a source.
