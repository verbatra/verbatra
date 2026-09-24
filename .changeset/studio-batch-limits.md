---
"@verbatra/studio": minor
---

Tell a rate-limited caller when to retry, and let the dashboard see its rate limits.

Previously a `METHOD_RATE_LIMITED` answer named no time to wait, and a call refused as already in
progress still used up rate-limit budget.

Now a `METHOD_RATE_LIMITED` answer carries `retryAfterSeconds` and a `Retry-After` header, and the
in-flight check runs before the rate limiter, so a refused duplicate costs nothing. The
`project.snapshot` capabilities carry `limits.retranslate` and `limits.reviewDecision` as
`{ windowMs, max }`, and the dashboard counts its own calls within the window, showing the limit
message with the seconds to wait instead of sending a call the server would refuse.
