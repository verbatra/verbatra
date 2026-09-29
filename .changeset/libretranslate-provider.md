---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `libretranslate`, a provider for a self-hosted LibreTranslate server.

Previously the only way to translate without sending strings to a hosted service was a local
language model through `openai-compatible`, which rules verbatra out wherever a policy bans
language models but accepts classic machine translation.

Now `provider: { id: "libretranslate", options: { baseUrl: "http://localhost:5000" } }` sends
each batch to LibreTranslate's `/translate` endpoint as a machine-translation provider. The key
is optional: `LIBRETRANSLATE_API_KEY` is sent only when it is set, so `doctor` passes without it,
and a server started with `--api-keys` that asks for one fails the run with `MISSING_API_KEY`
naming that variable. Placeholders are replaced with numbered markers before sending and put back
afterwards; a value whose markers do not come back intact, or an ICU value that carries plural or
select syntax, is withheld with a `PLACEHOLDER_UNSUPPORTED` notice instead of written. Its
languages are the models installed on the server, so every locale is `unverified` before a run
and `doctor --locales --live` checks them against the server's `/languages` list. A loopback
`baseUrl` passes the `local-only` network policy, an estimate reports characters with no cost,
and `verbatra init --provider libretranslate --base-url <url>` scaffolds it.
