---
"@verbatra/sdk": minor
"@verbatra/cli": minor
"@verbatra/mcp": minor
"@verbatra/studio": minor
---

Add a human-only mode: `provider: { id: "none" }` disables machine translation by policy.

- `@verbatra/sdk`: `none` is a new `ProviderConfig` variant whose `options` is always `{}`
  (filled in when omitted). No provider is ever constructed and no API key is read. `translate`
  and `watch` fill only from exact translation-memory hits, in a human-only bucket unaffected by
  tone and glossary changes, never apply a fuzzy reuse, and list every other missing or stale key
  in `LocaleSummary.unfilled`. A human-only dry run reads the memory so its plan matches a live
  run. `retranslateEntry` fails with the new `MACHINE_TRANSLATION_DISABLED` code, `doctor`
  reports machine translation disabled by policy, `scaffoldingMetadata.humanOnlyProviderId`
  names the id, and the new `isMachineTranslationEnabled` and `assertMachineTranslationEnabled`
  let a surface honour the policy. `ProviderId` now includes `"none"`, so an exhaustive `Record`
  or `switch` over it has to handle the new member.
- `@verbatra/cli`: `init --provider none` scaffolds a human-only config and no `.env.example`.
  `translate` exits `3` when keys are left for a human translation, and says so on stderr.
- `@verbatra/mcp`: the provider-spending tools are never advertised under `none`, even with
  `--allow-spend`, and `translation.translatePending` fails with `MACHINE_TRANSLATION_DISABLED`.
- `@verbatra/studio`: the spend capability is withheld under `none`, even with `--allow-spend`.
  The snapshot's `capabilities.spendWithheld` says why (`flag` or `policy`), and the settings
  panel names the reason.
