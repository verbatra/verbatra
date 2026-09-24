---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Give ICU `plural` and `selectordinal` arms the target language's CLDR categories.

Previously the LLM system rules told the model to preserve ICU syntax verbatim, so an English
`{n, plural, one {...} other {...}}` kept only `one` and `other` in Russian, Polish, Arabic or
Czech and kept an unreachable `one` in Japanese, and the integrity gate never compared arm sets.

Now, for next-intl and ARB, the SDK sends the target language's cardinal and ordinal categories
to LLM providers as `pluralCategories` in the user-turn payload, and one new compile-time system
rule asks for exactly those arms while keeping every `=N` arm, the `offset` and each `#`. The
integrity gate refuses, under the `icu` reason with one `details` line per wrong arm, a candidate
whose plural lacks a required category, keeps a category the language does not have, drops a
source `=N` arm, changes its `offset`, or whose `select` arms differ from the source's. A locale
without CLDR plural rules only needs `other`. Pseudolocalization is exempt. DeepL and Google Cloud
Translation keep withholding ICU values. Format adapters gain an optional `compareBranchArms` hook
(both factories accept it), and the per-request system-rule allowance in cost estimates and the
token budget grows with the new rule.

Upgrading: a stored value that kept the source's arms is now withheld when it is offered again, and
its key is sent to the provider and paid for again. This covers exact and fuzzy translation-memory
hits, duplicate-content reuse, and workbook or TMX imports. The most common case is a French,
Spanish, Italian or Portuguese plural without the CLDR `many` arm. Values already in a locale file
stay until their source changes.
