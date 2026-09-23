---
"@verbatra/studio": minor
---

Save Approve and Reject decisions in the Review queue.

Previously both buttons only hid the row in the open tab: nothing was written, a reload brought
the row back, and Reject left the value in the locale file. Approve now records the decision in
`verbatra.provenance.json`, and Reject asks for confirmation, removes the translation so the next
translate run replaces it, and records the decision too. The queue leaves out every entry
approved, rejected, or rewritten by a person since the run, for everyone who commits and pulls the
file, and a line above the table confirms each saved decision. The agent tools offer no approve or
reject.
