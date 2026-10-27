# Provider keys and behaviour

## Providers

| Provider id | Key variable |
| --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `gemini` | `GEMINI_API_KEY` |
| `deepl` | `DEEPL_API_KEY` |
| `google-translate` | `GOOGLE_TRANSLATE_API_KEY` |
| `openai-compatible` | `OPENAI_COMPATIBLE_API_KEY`, or a custom variable named in the config |
| `opencode` | `OPENCODE_API_KEY` |
| `libretranslate` | `LIBRETRANSLATE_API_KEY`, optional: only a server started with `--api-keys` needs it |
| `none` | none; no provider is constructed and no key is read |

Ask the human which provider to use unless the project already answers it. Do not
pick one that spends against a service nobody agreed to. `opencode` serves
OpenCode Zen's paid models over its Chat Completions endpoint only; OpenCode Go
and its free models are limited to OpenCode's own clients and do not work.
`openai-compatible` points at a local or self-hosted server and `libretranslate` at a self-hosted
LibreTranslate server (machine translation with no language model); both may
legitimately need no key at all. The three machine-translation providers,
`deepl`, `google-translate` and `libretranslate`, translate placeholder-bearing
strings through numbered markers and restore them. Each withholds a value it
cannot mask safely, such as one still carrying ICU syntax or, for DeepL and Google,
markup or a comparison sign beside a placeholder (Google also a line break, tab or
double space in a value with placeholders), and drops a result whose markers came back lost or changed; those
keys land under `providerFailures` with the notice `PLACEHOLDER_UNSUPPORTED` and
the locale ends `partial` or `failed`. Translate them by hand or with an LLM provider.
`libretranslate` locales stay `unverified` until
`doctor --locales --live` checks them against the server.

`provider: { id: "none" }` is the human-only mode. `translate` and `watch` fill
keys from the translation memory alone and report every other key as `unfilled`,
`translate` then exits `3`, the provider-spending agent tools are never offered,
and a single-key retranslation fails with `MACHINE_TRANSLATION_DISABLED`. Do not
read it as a broken setup, and do not switch it to a paying provider on your own.

The `provider` block is validated strictly: a key beside `id` and `options`, or an
option that belongs to another provider, fails the config with `CONFIG_INVALID`
rather than being ignored. Fix the field the message names; do not delete options
you do not understand. The CLI also reads `.env.local` and then `.env` from the
working directory, filling only variables the environment does not already set.

The config's `network` block (`policy` of `any`, `local-only` or `allowlist`, plus
`allowedHosts`) and the `VERBATRA_NETWORK_POLICY` and
`VERBATRA_NETWORK_ALLOWED_HOSTS` environment variables limit where a provider may
connect; when both are set, a host must satisfy each, and an invalid environment
value fails with `CONFIG_INVALID` instead of allowing every host. A refused host
fails a real run with `NETWORK_POLICY_VIOLATION` before any key is read or request
sent. `doctor` reports the effective policy in its `network-policy` check.

## Provider options that are easy to get wrong

- `requestTimeoutMs` (default `120000`) bounds each request attempt, not the whole
  retried call. Where a provider retries, a failure after the retries reports the
  last attempt's code: `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_ERROR` or
  `TIMEOUT`; Gemini also retries a timed-out attempt. Retry wiring differs by
  provider: DeepL is built with no retry dependencies, and Google Translate and
  LibreTranslate with network dependencies only, while the LLM providers get retry
  reporting too (`providerFactories` in `packages/sdk/src/config/provider-config.ts`).
  Raise the timeout for a slow local model rather than retrying by hand.
- `opencode` is configured as
  `provider: { id: "opencode", options: { model, maxOutputTokens } }`, plus the
  optional `requestTimeoutMs` and `localeMap`. It reads `OPENCODE_API_KEY` itself and
  takes no `baseUrl`.
- An `openai-compatible` `apiKeyEnvVar` that names a hosted provider's key variable,
  `OPENCODE_API_KEY` included, fails the config with `CONFIG_INVALID`, so a hosted key
  never reaches an arbitrary `baseUrl`. Use the hosted provider's own `id`, or name a
  different variable.
