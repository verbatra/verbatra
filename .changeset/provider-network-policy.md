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
unless its host is allowlisted. The built-in fetch-based providers also check every request,
resolve `localhost` to loopback only, refuse any redirect to another origin, and fail a refused
request once with the provider code `NETWORK_POLICY_VIOLATION`, without retries. `doctor` gains a
`network-policy` check that names the effective policy and the endpoint, for example
`any host (config: unset; VERBATRA_NETWORK_POLICY: unset)`.

An invalid `VERBATRA_NETWORK_POLICY` or `VERBATRA_NETWORK_ALLOWED_HOSTS` fails `translate` with
`CONFIG_INVALID` on a dry run and an estimate too, so they never pass where the live run would
fail; under provider `none` they are not checked. An `allowlist` policy that leaves out
`allowedHosts` is reported as `network.allowedHosts: The "allowlist" network policy needs at least
one entry in allowedHosts.`, the same as an empty list.
