---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

LibreTranslate provider, a `network` policy, per-run `--max-tokens`, per-attempt request
timeouts, and a strict `provider` block.

**LibreTranslate**
- `provider: { id: "libretranslate", options: { baseUrl } }` translates through a self-hosted
  server. `LIBRETRANSLATE_API_KEY` is optional. Placeholders are masked and restored, markup is
  kept, and an ICU plural or select is withheld with `PLACEHOLDER_UNSUPPORTED`.
- `init --provider libretranslate --base-url <url>` scaffolds it, and `doctor --locales --live`
  checks its languages.

**Network policy**
- A `network` block (`any`, `local-only`, `allowlist` with `allowedHosts`), or
  `VERBATRA_NETWORK_POLICY`, restricts where providers connect. A refused host fails with
  `NETWORK_POLICY_VIOLATION` before its key is read. `doctor` gains a `network-policy` check.

**Spend and requests**
- `translate --max-tokens <n>` (SDK: `maxTokens`) sets a hard per-run ceiling, and withheld keys
  are listed under `budgetWithheld`.
- `requestTimeoutMs` applies to each attempt, and a failure reports its real cause.
- An unknown key in the `provider` block fails with `CONFIG_INVALID`.
