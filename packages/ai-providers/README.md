# @verbatra/ai-providers

> Private package. Not published. Its source is bundled into `@verbatra/sdk` by tsup
> (`WORKSPACE_INTERNALS` in `packages/sdk/tsup.config.ts`), so a change here ships inside the sdk's
> published bytes and needs a changeset naming `@verbatra/sdk`. Do not install this directly;
> install [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk).

AI and machine-translation providers for verbatra behind one narrow interface. Six providers
implement the single `TranslationProvider` contract (`src/provider.ts`), so nothing upstream
branches on which one is configured.

## Responsibilities

- **One interface, six implementations.** Anthropic, OpenAI, Gemini and openai-compatible are
  `kind: "llm"`; DeepL and Google Cloud Translation are `kind: "machine-translation"`, a
  descriptive label, not a branch point.
- **One shared LLM layer.** The four LLM providers route through `runLlmTranslation`
  (`src/llm/run.ts`) by implementing an `LlmMechanism` that performs one HTTP call, sharing one
  response schema and one set of compile-time system rules. The two machine-translation providers
  implement `translateBatch` directly, taking strings and returning strings with no prompt.
- **Key handling.** `src/env.ts` owns `PROVIDER_ENV` and the `require<Name>Key()` helpers.
- **Structured failure.** Every provider failure surfaces as a `ProviderError` with a stable code,
  classified in `src/error-classification.ts`, never as a raw vendor SDK error.
- **Redaction, timeouts, review flags.** `src/redaction.ts` keeps a key value out of error text,
  `src/request-timeout.ts` bounds each call, `src/review-flags.ts` produces the `ReviewReasonCode`
  values the needs-review queue reads.

## What it must not do

- Depend on anything but `@verbatra/core`. Never import from `sdk`, `cli`, `studio`, `mcp`,
  `format-adapters`, `exchange` or `extract`.
- Read an API key from a config file, a CLI argument, or a function argument, or put a key value in
  an error message or a log line. The variable name may be named; the value never is.
- Treat untrusted text as instructions. System rules are compile-time constants, translatable
  strings travel only in the user-turn JSON payload, and provider output is schema-bound.

## Extending

Resolution is a factory table, not the exported `ProviderRegistry` (`src/registry.ts`), which is
deliberately not on the path: registering a provider there alone compiles and is never reached.
`providerFactories` in `packages/sdk/src/config/provider-config.ts` is a mapped type over
`ProviderId`, so a provider in the config union but missing from the table fails to compile. Adding one means a config schema in
`<provider>/config.ts`, a factory in `<provider>/<provider>-provider.ts`, key handling in
`src/env.ts`, an export from `src/index.ts`, then the two `provider-config.ts` steps. Ordered steps
are in [`CONTRIBUTING.md`](../../CONTRIBUTING.md); binding rules in
[`.claude/rules/architecture.md`](../../.claude/rules/architecture.md).

## Tests

```bash
pnpm turbo run test --filter=@verbatra/ai-providers
```

Coverage gate: 90 percent on lines, functions, statements, and branches.
