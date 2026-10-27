---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

LibreTranslate, DeepL and Google placeholder masking, network policy, a sensitive-data guard, `--max-tokens`, and `doctor --data-flow`.

**Providers**
- `provider: { id: "libretranslate", options: { baseUrl } }` translates through a self-hosted server. DeepL, Google and LibreTranslate mask placeholders and restore them byte-exact, so `Hello {{name}}` is translated; a value that cannot be protected is withheld with `PLACEHOLDER_UNSUPPORTED`.
- `requestTimeoutMs` applies to each attempt, and a failure reports its real cause.
- Translate with OpenCode Zen's paid models through `openai-compatible`; the providers docs show the config. OpenCode keeps Go and its free models for its own clients. A refused request now names the HTTP status and the server's reason (#281, thanks @MessiasLima).

**Privacy and spend**
- A `network` block or `VERBATRA_NETWORK_POLICY` restricts where providers connect, before a key is read.
- A `sensitiveData` block scans what a run sends for keys, emails, IBANs and card numbers: `warn` reports, `block` withholds the key, `redact` sends a token. `check --sensitive` runs it keyless.
- `translate --max-tokens <n>` sets a hard per-run ceiling.
- `verbatra doctor --data-flow` prints a manifest for a DPA review: provider, hosts with the policy verdict, data sent per locale and files written.
