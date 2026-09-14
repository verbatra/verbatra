---
"@verbatra/sdk": minor
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
all.

The figure is an upper bound and says so: it does not consult the translation memory and does not
collapse identical source strings, both of which a live run does. `RunSummary.estimate` carries
the whole breakdown as structured fields, per locale and in total, so `--json` consumers get the
numbers rather than a rendered string.
