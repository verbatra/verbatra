---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Check before spending whether the configured provider supports every locale.

Previously a locale the provider does not support failed only at request time, with
`INVALID_REQUEST`, after other locales may already have been paid for, and nothing said up front
that a glossary or a tone could not be applied for a language.

verbatra now ships a dated language table for DeepL and for Google Cloud Translation Basic, taken
from their documentation: the languages each accepts as source and target, and, for DeepL, which
ones support glossaries and formality. `translate` (dry runs and estimates included), `watch` at
startup, and `retranslateEntry` refuse a locale the table does not list with the new error code
`LOCALE_UNSUPPORTED_BY_PROVIDER` (exit 2 on the CLI) before any provider is constructed or anything
is spent, so no locale of the run is started. Leave the locale out with `--locales` to translate
the rest, or map it in `provider.options.localeMap`: an explicit mapping is trusted, so a language
added after the table's date still works. A glossary or tone the provider cannot apply for a
locale, a code that is only partly verified, and a language outside the LLM providers'
well-tested list are reported as notices on that locale instead
(`GLOSSARY_UNSUPPORTED_BY_PROVIDER`, `FORMALITY_UNSUPPORTED_BY_PROVIDER`,
`LOCALE_UNVERIFIED_BY_PROVIDER`, `LOCALE_NOT_WELL_TESTED`).

`doctor` gains a tenth check, `locales`, which fails on an unsupported locale and carries a
per-locale report under `result.locales`: the code each locale is sent as, whether the provider
supports it, and glossary and formality support. `verbatra doctor --locales` prints that report,
and `verbatra doctor --live` (the SDK's `live` input) first fetches the provider's current language
list, which uses no translation quota, when its API key is set and the network policy permits the
host.

DeepL now asks for a `formal` or `informal` tone with its `prefer_` formality options, so a target
language without formality control falls back to the default register with a
`FORMALITY_DOWNGRADED` notice instead of failing the request.
