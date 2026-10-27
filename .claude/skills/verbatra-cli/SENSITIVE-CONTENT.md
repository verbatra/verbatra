# Sensitive content

The config's `sensitiveData` block scans what a run would send to the provider
before any request: by default for API keys, email addresses, IBANs and card
numbers (`phone`, `ip` and `private-host` are opt-in `detectors`), plus the
project's own `patterns` and minus anything in `allow`. `mode` decides what a run
does with a match: `off` (the default without the block), `warn` (send as usual
and raise the notice `SENSITIVE_CONTENT_SENT`), `block` (withhold the key), or
`redact` (send a token in place of each match and restore it, withholding the key
when the match is in its key name, overlaps a placeholder, or the token does not
come back exactly once). Withheld keys are listed under
`result.locales[].sensitiveWithheld` and leave the locale `partial` or `failed`,
so the run exits `1`; they are retried on the next run. `verbatra init` writes
`sensitiveData: { mode: "warn" }` unless the provider is `none`, and
`check --sensitive` runs the same scan without a key. Never weaken the block, add
to `allow` or drop a detector to get a run through; say what was found and let
the human decide.
