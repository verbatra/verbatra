---
"@verbatra/studio": minor
---

Save Approve and Reject decisions in the Review queue.

Previously both buttons only hid the row in the open tab: nothing was written, a reload brought
the row back, and Reject left the value in the locale file. Approve now records the decision in
`verbatra.provenance.json`, and Reject asks for confirmation, removes the translation so the next
translate run replaces it, and records the decision too. The queue leaves out every entry
approved, rejected, or rewritten by a person since the run, for everyone who commits and pulls the
file, and a line above the table confirms each saved decision. Each row now shows the key's
current translation, so a decision is made on visible text. The confirmation uses a new `danger`
button, and the backdrop behind every dialog now dims the page in the dark theme too instead of
brightening it. A decision refused because the value
changed reloads the queue and the values, so the next click reviews the current text. Both actions
are rate limited per method, 60 calls a minute by default, set through the new
`reviewDecisionRateLimitWindowMs` and `reviewDecisionRateLimitMax` server options. The agent tools
offer no approve or reject.
