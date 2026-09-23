# 3. ICU plural arms follow the target language

- Status: accepted
- Date: 2026-09-23

## Context

An ICU message such as `{n, plural, one {# file} other {# files}}` carries one arm per CLDR
plural category of the language it is written in. English uses `one` and `other`; Russian,
Polish and Czech use `one`, `few`, `many` and `other`; Arabic and Welsh use all six categories;
Japanese uses `other` alone. A translation that keeps the English arms is grammatically wrong for
most counts in those languages, and one that keeps an English `one` arm in Japanese carries a
branch the runtime never selects.

Until now the shared LLM system rules
(`packages/ai-providers/src/llm/system-rules.ts`) said "Preserve placeholders and ICU syntax
verbatim: do not alter, add, remove, reorder", so the model copied the source's arm set, and the
integrity gate (`packages/sdk/src/flow/integrity-gate.ts`) never looked at arm sets at all: the
ICU placeholder comparison (`packages/format-adapters/src/icu/compare.ts`) tolerated both a
missing arm and an extra one.

## Decision 1: the target language's categories are request data, not rule text

The SDK resolves the target locale's cardinal and ordinal categories from `Intl.PluralRules`
(`packages/sdk/src/flow/plural-rules.ts`) and sets them on the provider-neutral request as
`pluralCategories`, only for an ICU format and only for a batch that holds a plural value. The
LLM layer sends them inside the user-turn JSON payload next to `sourceLocale` and `targetLocale`.
They are validated as the six CLDR keywords at the request boundary, so nothing but those words
can reach the payload through that field.

The system rules stay compile-time constants. They gain one generic rule that says what to do
when `pluralCategories` is present: give each `plural` exactly the `cardinal` keyword arms and
each `selectordinal` exactly the `ordinal` ones, drop unlisted keyword arms, write added arms from
the `other` arm, and keep every `=N` arm, the `offset` and each `#`. The preserve-verbatim rule
now names plural and selectordinal arms as its only exception. No locale-specific text is ever
interpolated into the rules, so the prompt-injection boundary is unchanged: untrusted strings and
per-request facts travel only as user-turn data.

The rules grow by about 90 tokens, so the per-request system-rule allowance the cost estimate
and the token budget reserve rises from 250 to 350 tokens.

## Decision 2: the gate judges arms against the target, not the source

Arm checking is an optional adapter hook, `compareBranchArms`, next to `comparePlaceholders`. The
ICU adapters (next-intl and ARB) implement it; both factories accept it, so an outside ICU-shaped
adapter can opt in. The gate calls it with a lookup for the target locale and refuses the
candidate under the existing `icu` reason, with one `details` line per wrong arm, when:

- a `plural` or `selectordinal` lacks a category the target language requires;
- it carries a keyword arm that is not one of the target language's categories;
- it drops one of the source's `=N` exact-value arms (added exact-value arms are accepted);
- its `offset` changed, or the branch changed kind;
- a `select` does not carry exactly the source's arm set.

Placeholder parity inside each arm is still judged by the placeholder comparison, which already
compares an arm the source lacks against the union of the source's arms. When the runtime has no
plural rules for a locale, only `other` is required and any CLDR keyword is accepted.

Because every write path goes through the gate (provider output, translation-memory reuse,
workbook and TMX import, `editEntry`, `retranslateEntry`), a hand-typed value is held to the same
rule as a model's. Pseudolocalization is exempt: its output keeps the source's arms by design.

## Decision 3: machine-translation providers keep their behaviour

DeepL and Google Cloud Translation cannot restructure an ICU message. They already withhold every
entry that carries placeholders or ICU syntax and report `PLACEHOLDER_UNSUPPORTED`, and an ICU
plural always carries its argument as a placeholder, so no machine-translated plural value ever
reaches the gate. They ignore `pluralCategories`. No separate review reason is added: a value
whose arms do not fit the target language is refused on every write path, so there is no state
in which such a value is written and merely flagged.

## Consequences

- An existing target value that kept the source's arms, for example a French plural without the
  CLDR `many` arm or a Japanese plural with a `one` arm, is refused when it is next offered for
  writing: a translation-memory hit or an import of it is withheld and the key is translated
  again. Values already in a locale file are not rewritten until their source changes.
- A model answer with the wrong arms gets no repair round. The LLM layer repairs only keys the
  response left out; a returned value that fails the arm rule is withheld as an integrity mismatch,
  its tokens are already spent, and the key is sent and billed again on the next run.
- `select` arm sets are now enforced. A translation that drops or invents a `select` arm is
  refused where it used to be written.
- The arm rule depends on the CLDR data of the Node.js runtime's ICU build; `verbatra doctor`
  already reports which one supplies the plural rules.
