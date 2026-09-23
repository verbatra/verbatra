---
"@verbatra/sdk": minor
---

Restrict where translation providers may connect with a `network` policy.

Previously any configured endpoint was reached, so keeping strings on your own network was a
convention a mistyped base URL or environment variable could break. A new `network` block takes
`policy: "any" | "local-only" | "allowlist"` and `allowedHosts`, and `VERBATRA_NETWORK_POLICY`
with `VERBATRA_NETWORK_ALLOWED_HOSTS` can pin a policy from the environment; a host must satisfy
both. `local-only` permits loopback, private IPv4 and unique-local IPv6 addresses, so a hosted
provider is refused with `NETWORK_POLICY_VIOLATION` before its key is read or any request is sent,
unless its host is allowlisted. The built-in fetch-based providers also check every request and
redirect, a request refused there fails with the provider code `NETWORK_POLICY_VIOLATION`, and
`doctor` gains a `network-policy` check that names the effective policy and the endpoint.
