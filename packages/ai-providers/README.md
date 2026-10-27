# @verbatra/ai-providers

> Private package. Not published. Its source is bundled into `@verbatra/sdk` by tsup
> (`WORKSPACE_INTERNALS` in `packages/sdk/tsup.config.ts`), so a change here ships inside the sdk's
> published bytes and needs a changeset naming `@verbatra/sdk`. Do not install this directly;
> install [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk).

## Purpose

AI and machine-translation providers for verbatra behind one narrow interface. Every provider
implements the single `TranslationProvider` contract (`src/provider.ts`), so nothing upstream
branches on which one is configured. It depends on `@verbatra/core` only.

## Responsibilities

- **One interface, many implementations.** Anthropic, OpenAI, Gemini, openai-compatible and OpenCode are
  `kind: "llm"`; DeepL, Google Cloud Translation and LibreTranslate are
  `kind: "machine-translation"`, a descriptive label, not a branch point. The
  [Providers page](https://verbatra.kreitz-webdev.de/docs/providers) is the user-facing list.
- **One shared LLM layer.** The LLM providers route through `runLlmTranslation`
  (`src/llm/run.ts`) by implementing an `LlmMechanism` that performs one HTTP call, sharing one
  response schema and one set of compile-time system rules. The machine-translation providers
  implement `translateBatch` directly, taking strings and returning strings with no prompt.
- **Placeholder masking.** `translateMaskedBatch` (`src/masked-batch.ts`) masks placeholders for a
  placeholder-blind engine; each provider's wire is its entry in `MASKED_WIRES`
  (`src/masked-wire.ts`).
- **Key handling.** `src/key-env-vars.ts` owns `PROVIDER_ENV`, the variable each provider reads its
  key from; `src/env.ts` owns the `require<Name>Key()` helpers for the providers that need a key
  and the optional readers for the ones that do not (`readLibreTranslateKey`,
  `resolveOpenAiCompatibleKey`).
- **Structured failure.** Every provider failure surfaces as a `ProviderError` with a stable code,
  classified in `src/error-classification.ts`, never as a raw vendor SDK error.
- **Redaction, timeouts, review flags.** `src/redaction.ts` keeps a key value out of error text,
  `src/request-timeout.ts` bounds each call, `src/review-flags.ts` produces the `ReviewReasonCode`
  values the needs-review queue reads.

## Boundaries

It must not:

- Depend on anything but `@verbatra/core`, or import from `sdk`, `cli`, `studio`, `mcp`,
  `format-adapters`, `exchange` or `extract`.
- Read an API key from a config file, a CLI argument, or a function argument, or put a key value in
  an error message or a log line. The variable name may be named; the value never is.
- Treat untrusted text as instructions. System rules are compile-time constants, translatable
  strings travel only in the user-turn JSON payload, and provider output is schema-bound.

## Layout

- `src/provider.ts`: the `TranslationProvider` interface.
- `src/<provider>/`: one folder per provider (`anthropic`, `openai`, `gemini`, `openai-compatible`,
  `opencode`, `deepl`, `google-translate`, `libretranslate`).
- `src/llm/`: the shared LLM translation layer.
- `src/masked-batch.ts`, `src/masked-wire.ts`, `src/masked-wire-codec.ts`: placeholder masking for
  machine-translation engines.
- `src/env.ts`, `src/key-env-vars.ts`: key handling.
- `src/registry.ts`: the exported `ProviderRegistry`, which is not on the runtime resolution path.

## Extending

Resolution is a factory table, not the exported `ProviderRegistry`, which is deliberately not on
the path: registering a provider there alone compiles and is never reached. `providerFactories` in
`packages/sdk/src/config/provider-config.ts` is a mapped type over `MachineProviderId` (every
`ProviderId` except the human-only `none`), so a provider in the config union but missing from the
table fails to compile. Adding one means a config schema in `<provider>/config.ts`, a factory in
`<provider>/<provider>-provider.ts`, key handling in `src/key-env-vars.ts` (`PROVIDER_ENV`) and
`src/env.ts`, an export from `src/index.ts`, then the two `provider-config.ts` steps, the
`PROVIDER_BILLING` entry in `packages/sdk/src/config/provider-billing.ts`, and the
`PROVIDER_DATA_FLOW` entry in `packages/sdk/src/config/provider-data-flow.ts`. A provider that masks
placeholders also gets its `MASKED_WIRES` entry. Ordered steps are in
[`CONTRIBUTING.md`](../../CONTRIBUTING.md); binding rules in
[`.claude/rules/architecture.md`](../../.claude/rules/architecture.md).

## Development

```bash
pnpm turbo run test --filter=@verbatra/ai-providers
```

Coverage gate: 90 percent on lines, functions, statements, and branches.

## Related

- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for setup, commit and changeset rules.
- [`@verbatra/core`](../core/README.md), the package this one builds on.

Licensed under the [MIT License](../../LICENSE).
