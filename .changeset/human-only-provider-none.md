---
"@verbatra/sdk": minor
"@verbatra/cli": minor
"@verbatra/mcp": minor
"@verbatra/studio": minor
---

Add a human-only mode: `provider: { id: "none" }` disables machine translation by policy.

- `@verbatra/sdk`: `none` is a new `ProviderConfig` variant with no options. No provider is ever
  constructed and no API key is read. `translate` and `watch` fill only from the translation
  memory and list every other missing or stale key in `LocaleSummary.unfilled`, leaving it
  untouched and unlocked. `retranslateEntry` fails with the new `MACHINE_TRANSLATION_DISABLED`
  code, `doctor` reports machine translation disabled by policy, and the new
  `isMachineTranslationEnabled` and `assertMachineTranslationEnabled` let a surface honour the
  policy. Code that reads `config.provider.options` now has to narrow on `provider.id` first.
- `@verbatra/cli`: `init --provider none` scaffolds a human-only config and no `.env.example`.
  `translate` exits `3` when keys are left for a human translation, and says so on stderr.
- `@verbatra/mcp`: the provider-spending tools are never advertised under `none`, even with
  `--allow-spend`, and `translation.translatePending` fails with `MACHINE_TRANSLATION_DISABLED`.
- `@verbatra/studio`: the spend capability is withheld under `none`, even with `--allow-spend`,
  and the settings panel names the policy instead of the flag.
