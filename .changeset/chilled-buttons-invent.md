---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add a keyless pre-run cost estimate: `verbatra translate --estimate`.

The estimate reuses the dry-run plan, so it constructs no provider, reads no API key, makes no
network call, and writes no file. It reports how many keys would be sent, how many provider
requests they would be split into, and the billing quantity the configured provider actually
charges for: estimated prompt and completion tokens for the LLM providers, estimated source
characters for DeepL and Google Cloud Translation.

verbatra still ships no prices of its own. A currency figure appears only when the config carries
a new optional `rates` block naming the date the rates were read, the currency code, and a table
of rates keyed by `provider/model`. Every figure is printed beside that date, so a stale number is
visibly stale. A provider or model with no rate on file is reported as such, with the exact config
key to add, rather than as a cost of zero; a rate written in the wrong unit is refused rather than
applied; and a self-hosted `openai-compatible` endpoint is reported as carrying no API cost at
all. `RunEstimate` is a union discriminated on `pricing`, so a priced estimate always carries its
figure, its currency and its date, and an unpriced one carries none of them.

The figure bounds the plan, not the invoice. Every provider call a live run schedules is counted,
including the plural-generation batches, which are a separate call path from the translation
batches; the prompt is measured by serializing the payload that would be sent rather than by
modelling its shape, so a configured glossary and tone are counted in every request they travel in;
and the response is sized from the source value plus a 50 percent expansion allowance, because the
translation does not exist yet and completion tokens are the expensive half of every rate card.
Against that plan a live run usually spends less, because it consults the translation memory and
collapses identical source strings.

It can also spend more, and `estimate excludes` names every way: the provider SDKs retry a failed
call underneath each counted request (two extra attempts on Anthropic, OpenAI and
openai-compatible, two on Gemini's own loop, five on DeepL), an incomplete response triggers a
repair round that re-sends the system rules, glossary and tone in full, a target language can
expand past the allowance, and the token figure is a character heuristic rather than the provider's
own tokenizer. The estimate covers `translate`; `retranslateEntry` calls a provider on its own path
and is not counted here.

A dry run now also reports the plural forms it would generate, whether or not an estimate was asked
for.

`RunSummary.estimate` carries the whole breakdown as structured fields, per locale and in total,
so `--json` consumers get the numbers rather than a rendered string.
