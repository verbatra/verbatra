---
"@verbatra/sdk": patch
---

Bound the recursion depth when serializing translated XLIFF inline markup (`<g>`, `<x>`, and similar elements), matching the depth limit already enforced for JSON and YAML trees. Adversarially deep nested elements in translated content now raise a structured `AdapterError` instead of silently degrading to escaped plain text after an internal, previously-swallowed stack overflow.
