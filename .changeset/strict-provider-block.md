---
"@verbatra/sdk": minor
---

Reject unknown keys in the `provider` block beside `id` and `options`.

Previously a key such as a misplaced `provider.localeMap` or a typo such as `optionss` was dropped
without a word, so the setting it carried silently had no effect. Now the config load fails with
`CONFIG_INVALID` naming the key, for example `provider: Unrecognized key: "localeMap"`, and the
published JSON Schema marks every provider variant with `additionalProperties: false`.

Compatibility: a config with a stray key in its `provider` block no longer loads. Move the key
under `provider.options` if it is a provider option, or remove it.
