---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Read and write the translation memory as TMX, the interchange format every mainstream translation
platform can produce and consume: `verbatra tmx import <file>` and `verbatra tmx export [file]`,
`importTmx` and `exportTmx` from the SDK. A team arriving with years of accumulated memory no longer
starts cold, and a team leaving can take theirs.

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
non-fatal is treated as fatal, so an undeclared entity reference cannot survive as literal text.

A refused file never produces a raw parser error or a hang. `importTmx` throws an `SdkError` with
code `SOURCE_INVALID` whose message names the file and what failed, and, when the problem has a
place in the file, its line, column and, inside a translation unit, the unit's 1-based ordinal.
`tmxErrorLocation(error)` returns the same place as a structured `TmxErrorLocation`, or `undefined`
for any other error, so a caller never casts the error or its `cause`. A parser's own description is
kept readable, without the nested `Error: ` prefix or a space before the closing period, and
`verbatra tmx import` prints that message on its error line and in the `--json` error envelope, so a
mismatched closing tag in the second unit and a truncated file are reported as two distinct, located
refusals.

Nothing lands in the memory unchecked. Every candidate translation passes the same placeholder, ICU,
degeneracy and emptiness gate that provider output and a filled translator handoff already face,
enforced where the record enters the store rather than left to the run that later reads it, so a
record that was never validated can never be served as a reuse. A unit whose source segment is blank
identifies no string and is refused. Inline markup is flattened to its text, which the placeholder
check then catches if the markup carried anything that mattered; the text of a `sub` element, a
sub-flow such as a tooltip embedded in that markup, is not part of the segment's string and is left
out. Every refusal, skip, flattening and left-out sub-flow is counted and reported.

A language tag resolves against the source locale and every configured target locale at once, by an
explicit rule. After lowercasing and folding underscores to hyphens, an exact match wins, so
`pt_BR`, `pt-br` and `pt-BR` are one locale. Failing that, a tag resolves onto a configured locale
that is a strict subtag prefix of it, and when several are, onto the longest, as RFC 4647 lookup
does: a file written in `en-US` lands in a project configured for `en`, and `de-AT-1996` lands on
`de-AT` in a project configured for `de` and `de-AT`. A shorter tag widens onto a configured locale
that begins with it only when every subtag the locale adds is a region or a variant, never a script,
so a file written in `de` lands in a project configured only for `de-DE` while `sr` never lands on
`sr-Latn` and `zh` never on `zh-Hant-TW`; a prefix of the tag always takes precedence, and among
several longer locales the nearest wins. Two tags whose script or region subtags differ never match,
so `zh-CN` is never stored as `zh-TW`, `sr-Latn` never as `sr-Cyrl`, and `de-AT` never as `de-CH`;
such a tag is reported as unmatched rather than guessed at, and a tag is reported as ambiguous only
when the configured locales it could reach do not lie on one prefix chain. Resolving against the
whole configured set in one pass is what keeps a regional target such as `pt-BR` from being taken
for the bare `pt` source it extends. Source segments are ranked like target segments: an exact tag
outranks a prefix match and identical values agree, so `en` and `en-US` both reading "Save" import
normally, while a unit whose equal-ranked source segments carry different values is refused rather
than attributed to whichever came last, and a config whose source and one target are the same tag
once normalized is refused outright.

Two target segments of one unit that resolve to the same configured locale never let the last one
silently win. An exact tag always outranks a segment that only reaches the locale by subtag prefix,
so `de` beats `de-CH` in a project configured for `de`. Two segments of equal standing that carry
different values store nothing for that locale in that unit and are counted per locale as
`conflicting`, shown in the human summary and carried in the `--json` result; the unit's other
locales still land, and two segments carrying the same value are not a conflict.

Tags matching nothing configured are counted per tag, as are units skipped, units with no source
segment, units whose markup was flattened, and `tu` elements sitting outside the file's first
`body`. A header `srclang` that is not the configured source locale is reported rather than ignored.

Imported units are stored under the project's current configuration fingerprint, the same key a real
run writes, so an imported memory is reused exactly when the configuration that would consume it
matches and stops matching when the provider, model, tone or glossary changes. Where an imported
unit disagrees with a translation the project already holds, the project's own translation wins and
the imported one is counted as kept; `--overwrite` reverses that. Importing the same file twice
therefore changes nothing the second time and writes no file at all.

One consequence is stated plainly in the published docs rather than left implicit, because no
import-time check can police it: an accepted unit's source text lands in the memory's source index,
which is what fuzzy reuse scores a changed string against. An imported source that differs from a
project string can therefore be served for it by fuzzy reuse, which is what resemblance means. An
imported source that is identical to a project string but hashes differently is not reachable at
all: fuzzy reuse discards any candidate whose normalized source equals the query, so a project entry
carrying a description, a meaning, or a plural flag that a TMX unit cannot carry falls through to
the provider instead. A fuzzy reuse still faces the integrity gate against the real entry and is
reported as a `FUZZY_CACHE_REUSE` review flag, so it is visible; a project that does not want an
imported memory reachable that way should leave `fuzzyCache` out of its config.

Export refuses the same configuration import refuses: a source locale and a target locale that are
one tag after normalizing case and separators would produce two language attributes the import could
not tell apart, so the file a project exported would be one it could not read back.

A narrowed run reports the configured locales it left out, so `--locales de` on a file that also
carries French does not read like a file holding less than it does.

Export writes one `tu` per distinct source string with the source segment and one target segment per
exported locale, escaping segment text so markup inside a value stays data and a carriage return
survives a reader's line-ending normalization, and removing the characters XML 1.0 cannot represent
at all, lone surrogates and noncharacters included, so the artifact is one a conformant parser
accepts. How many characters were removed is returned as `illegalCharactersRemoved` and reported by
`verbatra tmx export`. Language tags are written in BCP 47 form whatever spelling the config uses:
underscores become hyphens, the language is lowercase, a script is title case and a region
uppercase, so a project configured for `en_US` and `pt_BR` writes `srclang="en-US"` and
`xml:lang="pt-BR"`, and that file re-imports into the same config unchanged. How verbatra keys its
memory is not affected. An empty memory produces a valid, empty TMX file rather than an error. The
cache schema is unchanged: export reads the source text the memory already stores beside each entry,
and an entry carried forward from a cache written before that block existed is left out and counted
rather than written without a source.
