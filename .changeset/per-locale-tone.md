---
"@verbatra/sdk": minor
---

Set the tone per target locale, and the LLM providers now state what each tone means.

**Added**
- `tone` accepts a map from a target locale to its own tone, with `default` for every locale the map does not name, for example `tone: { default: "informal", ja: "neutral" }`. A key must be one of `targetLocales`, spelled exactly as configured: an empty map, an unknown key and two keys that differ only in case are refused when the config loads.
- `toneForLocale(tone, locale)` resolves the tone that applies to one locale, so code that reads `config.tone` keeps working with both shapes.
- Changing the tone of one locale stops cached translations from being reused for that locale only. A config with a single tone keeps its cache.

**Changed**
- The LLM providers (Anthropic, OpenAI, Gemini, OpenCode and openai-compatible) now send one fixed rule that names the register of each tone: `informal` is the familiar second person, `formal` the polite one, and `neutral` avoids direct address in every language. No tone writes slang or a casual style. In Japanese, `informal` and `neutral` write polite です/ます, never casual endings such as よ, ね or だよ, and `formal` writes keigo. The fixed rules grow, so a pre-run estimate counts about 150 more input tokens per request.
- With DeepL, `informal` still sends `prefer_less`. Use `ja: "neutral"` for Japanese.

**Upgrade:**
- Japanese output from an LLM provider changes: new and retranslated values use polite です/ます instead of casual endings such as よ, ね or だよ. Japanese values already written stay as they are, and the cache keeps serving them, because it does not see the new rule. To refresh them, retranslate the Japanese keys with `retranslateEntries` from the SDK, which leaves values a person wrote and pinned keys alone (one provider request per key). If every Japanese value is machine output, deleting the Japanese locale file and running `verbatra translate --locales ja --no-cache` refreshes them in one run, but it also drops any Japanese value a person wrote or imported.
- Under `budgetBehavior: "stop"`, each request now reserves about 150 more tokens for every provider, so a `maxTokens` just above one batch may now withhold it. Raise `maxTokens` or lower `maxBatchSize`.
- `VerbatraConfig["tone"]` may now be an object. Read it per locale with `toneForLocale(config.tone, locale)` instead of comparing it to a string.
