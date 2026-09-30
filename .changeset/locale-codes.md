---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

BCP 47 locale validation, provider language tables with `localeMap` and a pre-spend check,
gettext script spellings, and state carry-over when a locale is respelled.

**Locale codes**
- Locale codes must be well-formed BCP 47 tags, and an invalid one fails with `CONFIG_INVALID`
  and a suggested spelling. `doctor` names non-canonical codes.
- The `posix` style spells a script and a numeric region (`zh_Hant_TW`, `es_419`), and a
  `gettext-po` project uses gettext names (`sr-Latn` as `sr@latin`, `zh-Hant-TW` as `zh_TW`).
- After a respelling such as `pt_BR` to `pt-BR`, the next run carries the lock-file, memory and
  provenance state over once (`LOCALE_STATE_CARRIED_OVER`). `doctor` names orphaned state.

**Providers and languages**
- `provider.options.localeMap` maps a configured locale to the code a provider receives. DeepL and
  Google otherwise receive normalized codes.
- DeepL and Google ship a dated language table, and an unsupported locale is refused with
  `LOCALE_UNSUPPORTED_BY_PROVIDER` before anything is spent. An explicit `localeMap` is trusted.
- `doctor --locales` reports each locale's support, and `--live` fetches the provider's list.
- LLM providers receive the language, script and region names, so `sr-Latn` comes back in Latin.
