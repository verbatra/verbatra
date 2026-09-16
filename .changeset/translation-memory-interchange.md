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

An imported file is untrusted third-party XML and is treated as such. Its size is bounded before the
parser sees it. The prolog is scanned as a prolog rather than by searching the raw bytes, so the
decision about doctypes and entity declarations is made only on the region before the root element
and can neither cut payload out of a data section nor refuse a translation that happens to discuss
an entity declaration. Every doctype in the prolog is inspected, not just the first; an internal DTD
subset or an entity declaration is refused outright, so neither an external entity reference nor an
unbounded expansion can be reached; a greater-than inside a system identifier does not end the
declaration early; and the bare external doctype that real writers emit is discarded rather than
fetched. Unit, language and segment-length bounds are enforced during the walk, the root element
must be `tmx` in no namespace or the TMX one, and a well-formedness error the parser reports as
non-fatal is now fatal, so an undeclared entity reference cannot survive as literal text. Every
refusal is a structured `ExchangeError` naming what failed, never a raw parser error and never a
hang.

Nothing lands in the memory unchecked. Every candidate translation passes the same placeholder,
ICU, degeneracy and emptiness gate that provider output and a filled translator handoff already
face, enforced where the record enters the store rather than left to the run that later reads it,
so a record that was never validated can never be served as a reuse. A unit whose source segment is
blank identifies no string and is refused. Inline markup is flattened to its text, which the
placeholder check then catches if the markup carried anything that mattered. Every refusal, skip
and flattening is counted and reported.

A language tag resolves against the source locale and every configured target locale at once, by an
explicit rule: the exact spelling wins after
lowercasing and folding underscores to hyphens, so `pt_BR`, `pt-br` and `pt-BR` are one locale;
failing that, the single configured locale sharing the tag's primary subtag, so a file written in
`en-US` lands in a project configured for `en`; and a tag that two configured locales could equally
claim is reported rather than guessed at. Resolving against the whole configured set in one pass is
what keeps a regional target such as `pt-BR` from being taken for the bare `pt` source it shares a
primary subtag with. A unit carrying two segments that both resolve to the source locale is refused
rather than attributed to whichever came last, and a config whose source and one target are the same
tag once normalized is refused outright. Tags matching nothing configured are counted per tag, as
are units skipped, units with no source segment, units whose markup was flattened, and `tu` elements
sitting outside the file's first `body`. A header `srclang` that is not the configured source locale
is reported rather than ignored.

Imported units are stored under the project's current configuration fingerprint, the same key a
real run writes, so an imported memory is reused exactly when the configuration that would consume
it matches and stops matching when the provider, model, tone or glossary changes. Where an imported
unit disagrees with a translation the project already holds, the project's own translation wins and
the imported one is counted as kept; `--overwrite` reverses that. Importing the same file twice
therefore changes nothing the second time and writes no file at all.

One consequence is stated plainly in the published docs rather than left implicit, because no
import-time check can police it: an accepted unit's source text lands in the memory's source index,
which is what fuzzy reuse scores a changed string against. An imported source that merely resembles
a project string can be served for it by fuzzy reuse even though the exact path never would, since
the exact path keys on a hash covering the description, meaning and plural flag that a TMX unit does
not carry, while fuzzy reuse compares source text alone. Such a reuse still faces the integrity gate
against the real entry and is reported as a `FUZZY_CACHE_REUSE` review flag, so it is visible; a
project that does not want an imported memory reachable that way should leave `fuzzyCache` out of
its config.

Export writes one `tu` per distinct source string with the source segment and one target segment
per exported locale, escaping segment text so markup inside a value stays data and a carriage
return survives a reader's line-ending normalization, and removing the characters XML 1.0 cannot
represent at all, lone surrogates and noncharacters included, so the artifact is one a conformant
parser accepts. An empty memory produces a valid, empty TMX
file rather than an error. The cache schema is unchanged: export reads the source text the memory
already stores beside each entry, and an entry carried forward from a cache written before that
block existed is left out and counted rather than written without a source.
