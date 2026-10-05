---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

LibreTranslate, placeholder masking, network policy, sensitive-data guard, `--max-tokens`, timeouts.

**LibreTranslate**
- `provider: { id: "libretranslate", options: { baseUrl } }` translates through a self-hosted
  server. `LIBRETRANSLATE_API_KEY` is optional. Placeholders are masked and restored, markup is
  kept, and an ICU plural or select is withheld with `PLACEHOLDER_UNSUPPORTED`.
- `init --provider libretranslate --base-url <url>` scaffolds it, and `doctor --locales --live`
  checks its languages.

**DeepL and Google placeholders**
- Placeholders travel as numbered markers the engine leaves alone (an ignored `<x>` tag for DeepL,
  a `translate="no"` span for Google) and are restored byte-exact, so `Hello {{name}}` is
  translated instead of withheld.
- A value whose placeholders cannot be protected (ICU syntax, markup or other brackets beside
  them), a Google value with line breaks, tabs or double spaces, and a result whose markers do not
  come back intact are still withheld with `PLACEHOLDER_UNSUPPORTED`, which now names a next step.
  Values without placeholders or placeholder-like tokens are sent exactly as before.

**Network policy**
- A `network` block (`any`, `local-only`, `allowlist` with `allowedHosts`), or
  `VERBATRA_NETWORK_POLICY`, restricts where providers connect. A refused host fails with
  `NETWORK_POLICY_VIOLATION` before its key is read. `doctor` gains a `network-policy` check.

**Sensitive data**
- A `sensitiveData` block scans what a run is about to send for API keys, email addresses, IBANs
  and card numbers (plus opt-in `phone`, `ip`, `private-host` and your own `patterns`). `warn`
  reports it, `block` withholds the key (`sensitiveWithheld`, exit 1), and `redact` sends a token
  and restores the match. Off unless configured; `init` writes `warn` for a machine provider.
- `check --sensitive` runs the same scan without a key and exits 1 on any finding. A false
  positive goes into `sensitiveData.allow`.

**Spend and requests**
- `translate --max-tokens <n>` (SDK: `maxTokens`) sets a hard per-run ceiling, and withheld keys
  are listed under `budgetWithheld`.
- `requestTimeoutMs` applies to each attempt, and a failure reports its real cause.
- An unknown key in the `provider` block fails with `CONFIG_INVALID`.
