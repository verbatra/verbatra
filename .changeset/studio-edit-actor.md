---
"@verbatra/studio": minor
---

Record whether a Studio edit came from a person or from an agent.

Previously every value saved through `translation.editEntry` looked the same. The RPC method now
takes an optional `actor`: the edit dialog leaves it out, so its values are recorded as `human` in
`verbatra.provenance.json`, and the `verbatra_translation_editEntry` WebMCP tool always sends
`agent`, without letting the agent choose. Studio also explains a corrupt provenance file in plain
words.
