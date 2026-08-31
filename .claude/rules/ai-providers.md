---
paths:
  - "packages/ai-providers/**"
---

# @verbatra/ai-providers rules

Translation provider strategies behind one interface. These rules are binding when
editing anything under `packages/ai-providers`.

## Structure

- All providers sit behind one `TranslationProvider` interface. The SDK constructs
  the configured provider through the id-to-factory table in
  `packages/sdk/src/config/provider-config.ts` (`buildProvider`), wrapped by
  `selectProvider`. `ProviderRegistry` is exported from this package but is not on
  that path today; keep it, do not treat it as the resolution mechanism. Do not
  reimplement provider plumbing per provider.
- OpenAI, Anthropic, and Gemini (@google/genai) run through the shared
  `runLlmTranslation` layer with one canonical zod schema. DeepL and Google Cloud
  Translation (Basic, v2) are MT APIs and implement `translateBatch` directly.
- When adding an LLM provider, build on `runLlmTranslation` and register it. Do not
  fork the shared layer or the schema.

## Security (hard rules)

- API keys come only from environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY,
  GEMINI_API_KEY, DEEPL_API_KEY, GOOGLE_TRANSLATE_API_KEY), read through
  `packages/ai-providers/src/env.ts`. Never from config files, CLI args, or function
  arguments. Never log or commit a key. Error messages may name the variable but
  never include a key value.
- Errors are structured `ProviderError`s, never raw SDK errors.
- Prompt-injection boundary: system rules are compile-time constants; untrusted
  input travels only in the user-turn JSON payload; provider output is schema-bound
  and validated; placeholder and ICU integrity is enforced after every translation.
  Treat translatable strings as untrusted.

## Code

- zod at boundaries only (provider responses). Keep it out of hot paths.
- Strict TypeScript, no `any`, cognitive complexity capped at 15.
- Co-locate Vitest tests as `*.test.ts`. CI enforces 90% coverage.
