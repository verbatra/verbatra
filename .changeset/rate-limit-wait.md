---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Report an exhausted provider quota as such instead of retrying it.

- **Rate limits:** when a provider states how long to wait after an HTTP 429 (Gemini's retry delay, or a `Retry-After` header), the `RATE_LIMITED` message now says how long, for example "the provider asks to wait about 2 h 29 min: its quota is likely exhausted". The code is unchanged.
- **Gemini:** after an HTTP 429, a stated wait of more than 5 seconds fails at once instead of retrying after 250 ms and 500 ms; a shorter one is honoured in place of the fixed backoff. A 5xx answer keeps the ordinary backoff whatever wait it states.
- **Hint:** the `RATE_LIMITED` next step now covers both a short throttle and an exhausted quota.
- **Upgrade:** a Gemini 429 with a stated wait over 5 seconds used to be retried twice before failing; it now fails on the first answer. Wait as long as the message says, or switch to another key or model.
