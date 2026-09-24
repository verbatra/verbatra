---
"@verbatra/sdk": patch
---

Stop repeating the check title in the `doctor` network-policy detail.

Previously the detail began with `Network policy:`, so the CLI printed
`Network policy: Network policy: any host ...`. Now the detail starts with the effective policy,
for example `any host (config: unset; VERBATRA_NETWORK_POLICY: unset)`.
