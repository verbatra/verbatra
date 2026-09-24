---
"@verbatra/mcp": patch
---

Leave decided entries out of `review.queue`.

Previously the tool listed every key the last run flagged, including ones a person had rewritten
since. It now leaves those out, as well as entries approved or rejected through the new review
decisions, and adds the `provenance` of each remaining entry's current value. The server still
offers no tool to approve or reject.
