---
"@verbatra/sdk": minor
---

Set the tone per target locale, and the LLM providers now state what each tone means.

**Added**
- `tone` accepts a map from a target locale to its own tone, with `default` for every locale the map does not name, for example `tone: { default: "informal", ja: "neutral" }`.
- A map key must be one of `targetLocales`, spelled exactly as configured. An empty map, a key that is not a target locale and two keys that differ only in case are refused when the config loads.
- `toneForLocale(tone, locale)` resolves the tone that applies to one locale, so code that reads `config.tone` keeps working with both shapes.
- Changing the tone of one locale retranslates only that locale. A config with a single tone keeps its cache.

**Changed**
- The LLM providers (Anthropic, OpenAI, Gemini, OpenCode and openai-compatible) now send one fixed rule that names the register of each tone. In Japanese, `informal` and `neutral` write polite です/ます, never casual endings such as よ, ね or だよ, and `formal` writes keigo. The fixed rules grow, so a pre-run estimate counts about 100 more input tokens per request.
- With DeepL, `informal` still sends `prefer_less`. Use `ja: "neutral"` for Japanese.

**Upgrade:**
- Japanese output from an LLM provider changes: values that used casual endings are now polite. The cache does not see the new rule, so existing Japanese values stay until you retranslate them: delete the Japanese locale file and run `verbatra translate --locales ja --no-cache`, or change the tone of `ja` in the config.
- `VerbatraConfig["tone"]` may now be an object. Read it per locale with `toneForLocale(config.tone, locale)` instead of comparing it to a string.
