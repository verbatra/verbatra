# Landing playground generator

This script produces `apps/docs/lib/playground/translations.json`, the pre-generated
translations the landing page playground animates. It runs the real Verbatra SDK
(`translate` from `@verbatra/sdk`) with Gemini, once, on a maintainer's machine. Visitors never
trigger a request: the site only reads the committed JSON.

It is a showcase tool and nothing else. It cannot translate project files, take arbitrary input,
or run in CI.

## Dry run and `--write`

```sh
pnpm --filter @verbatra/docs playground:generate          # dry run (default)
pnpm --filter @verbatra/docs playground:generate --write  # sends requests, writes the JSON
```

The dry run prints the items, the target languages, the provider, model and token cap, the
planned item and language pairs, and two request estimates: one per language batch, and the
SDK's own estimate (`translate` with `estimate: true`, which constructs no provider and reads no
key). It sends nothing and writes nothing.

`--write` is the only mode that sends. It plans the same pairs, runs the SDK, validates every
result, and only then replaces the JSON. Review the change with
`git diff -- apps/docs/lib/playground/translations.json` before committing it.

Runs are incremental. The script reads the committed JSON (see [Disk access](#disk-access)) and requests
only pairs that are missing, or whose source text or `sameAllowed` flag changed. Everything else
is kept as committed.

## Adding a word or a language

- **A word**: add an entry to `PLAYGROUND_SOURCE` in `source.ts`, with a camelCase `id` and the
  English `text`. Set `sameAllowed: true` only for a value that may stay identical in every
  language, such as a brand name.
- **A language**: add its code to `PLAYGROUND_LANGUAGES` in `source.ts`. It must be in
  `LANGUAGE_ALLOWLIST` in `limits.ts` (de, es, fr, ja, pt-BR).

Run the dry run, check the plan, then run `--write`.

## Guards and why they exist

| Guard | Why |
| --- | --- |
| Refuses when `CI` or `GITHUB_ACTIONS` is set, `NODE_ENV` is `production` (any case), `/.dockerenv` or `/run/.containerenv` exists (Docker, Podman), or stdin and stdout are not both a TTY | Generation is a deliberate local act. It must never run in a pipeline, a build, or an image. |
| Refuses when `GEMINI_API_KEY` is already set | The run must never pick up a real project key by accident. |
| Reads only `GEMINI_PLAYGROUND_API_KEY`, copied into `GEMINI_API_KEY` for this process and only on `--write` | The SDK reads `GEMINI_API_KEY`; the copy keeps the playground key separate and out of every other process. A dry run never touches the key. |
| Input is the typed constant in `source.ts`; the only argument is `--write` | No paths, globs, or free text, so the tool cannot be pointed at real files or arbitrary input. |
| At most 12 items of at most 40 characters; letters, spaces, `. , ! ? ' -` and `{name}` placeholders only | Keeps the showcase small and the request budget predictable. |
| At most 5 languages, all from the allowlist | Same reason; also keeps the playground's language set reviewed. |
| Rejects emails, URLs, phone numbers, digit sequences, @handles and key-like strings before any request | Nothing personal or secret may ever be sent to a provider, even by mistake. |
| Model pinned to `gemini-2.5-flash`, `maxOutputTokens` 2048; temperature is the provider default and is recorded as such | The SDK's Gemini options have no temperature setting; the metadata says so honestly. |
| At most 20 attempts, counted from the SDK's public progress events: a sub-batch, a repair round and a provider retry count one each, a truncation split counts two (it resends both halves). Aborts through `TranslateInput.signal` on the first provider retry with status 429, or past the cap | Hard request budget on a free-tier key. A cancelled run writes nothing. |
| Any other provider failure (auth, quota, another 4xx, a 5xx after the provider's own retries) aborts the run through the same signal once its locale finishes incomplete, and is reported as a provider failure with redacted messages | A failing key or quota never burns through the rest of the budget, and the report says what actually failed. |
| Every result is validated: non-empty, single line, at most 80 characters, every source placeholder exactly once and unchanged, no HTML, markdown, URLs or bare domains, code fences, control characters or bidi and zero-width format characters, not identical to the source unless `sameAllowed` | Provider output is untrusted. If any value fails, nothing is written. |
| Atomic write: a temp file in the same directory, then a rename | A crash never leaves a half-written JSON. |
| The output holds only items, translations and metadata (SDK version, provider, model, generation date, temperature note) | No request ids or raw provider responses reach the repository. |
| Error output goes through the SDK's `redact`, and the key value is scrubbed as well | A key never reaches the terminal or a log. |
| The SDK runs fully in memory through script-owned `SdkFs` and `AdapterFs` ports | No SDK path reads or writes project files, a lock file, or a cache on disk. The one exception is outside the ports: the SDK's lock-holder check reads two kernel identity values under `/proc` directly (absent on macOS); `no-real-disk.test.ts` pins exactly those two reads. |
| Excluded from the app `tsconfig.json`, the Docker context (`.dockerignore`), and app imports (Biome `noRestrictedImports` for `import`, plus `lib/no-scripts-import.test.ts`, which also catches `require()`) | The script, its key handling, and the provider endpoint never reach the build or the shipped site. Both checks cover `app/`, `components/`, `lib/`, `i18n/` and the app-root sources (`proxy.ts`, `instrumentation.ts`, `next.config.mjs`, `source.config.ts` and the rest). `lib/no-playground-secrets.test.ts` checks that no app file names the endpoint host or the key variable. |

The unit tests next to each module cover these guards; `pnpm --filter @verbatra/docs test` runs
them, and `pnpm --filter @verbatra/docs typecheck` type-checks this folder through its own
`tsconfig.json`. Neither runs the script.

## Abort and backoff

On a retryable failure the Gemini provider reports the retry before it waits:
`packages/ai-providers/src/gemini/retry.ts:69` calls `onRetry`, which the SDK forwards
synchronously as a `provider-retry` progress event, and only then does line 70 start the pause
(250 ms on the first retry, `DEFAULT_GEMINI_RETRY` at line 10). On the first 429 the script
aborts inside that progress callback, so the signal is already aborted when `delay` (lines 37-48)
registers its abort listener at line 47. That listener never fires, the 250 ms pause runs to the
end, and the check at lines 71-72 throws an abort, so no further request is sent. An abort that
arrives while a later pause is running fires the listener and cuts the pause short.
`packages/ai-providers/src/gemini/retry.test.ts:177-222` pins both cases.

## Disk access

The SDK runs on the script's in-memory `SdkFs` and `AdapterFs` ports. The only reads outside
them are the SDK's read-only holder-liveness reads in `readKernelIdentity`
(`packages/sdk/src/fs.ts:396-404`): `/proc/sys/kernel/random/boot_id` (line 398) and
`/proc/self/ns/pid` (line 400). Both are absent on macOS and come back empty there.
`apps/docs/scripts/playground/no-real-disk.test.ts:13-14` allows exactly these two reads and
fails on any other disk or child-process access.

The script's own reads:

- `lib/playground/translations.json`, the committed output (`output.ts:95`).
- An existence probe for `/.dockerenv` and `/run/.containerenv` (`environment.ts:4`, checked with
  `existsSync` at line 14).
- `@verbatra/sdk/package.json`, loaded as a JSON module import for the SDK version
  (`generate.ts:2`).

## Key file location

The key lives in `apps/docs/scripts/playground/.env.local`, which `apps/docs/.gitignore` ignores.
It does not go in `apps/docs/.env.local`: Next.js loads that file into every `next dev` and
`next build` process, so the key would reach the app. This folder is never read by Next and is
excluded from the Docker context.

## Manual setup

1. Create a dedicated Google Cloud project for the playground key, with **no billing account**
   attached, so the key can never incur costs.
2. Create an API key in that project and restrict it to the **Gemini API (Generative Language
   API)** only.
3. Put the key in `apps/docs/scripts/playground/.env.local` as `GEMINI_PLAYGROUND_API_KEY=...`,
   next to this README, not in `apps/docs/.env.local`. Next.js loads `apps/docs/.env.local` into
   every `next dev` and `next build` process, while this folder is never read by Next and is
   excluded from the Docker context. Confirm the file is ignored with
   `git check-ignore -v apps/docs/scripts/playground/.env.local`; the `.env.local` pattern in
   `apps/docs/.gitignore` matches it. The package script loads it through Node's
   `--env-file-if-exists`, so the script itself never opens it.
4. Make sure `GEMINI_API_KEY` is not set in the shell you run the script from.
