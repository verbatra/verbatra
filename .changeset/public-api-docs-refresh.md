---
"@verbatra/sdk": patch
"@verbatra/mcp": patch
"@verbatra/studio": patch
---

Bring the published type documentation in line with the code. Every declaration and every
interface member in the built `.d.ts` files now carries a doc comment, and the ones that had
fallen behind were corrected: which flows throw which `SdkError` codes, what a dry run skips,
how the lock timeout and the fuzzy cache similarity behave, what `LocaleSummary.status`,
`translated` and `unfilled` really count, which notice codes DeepL and Google Cloud Translation
emit, what the format adapter factories refuse, and what the MCP server's `onLog`, `fs` and
handle options do. The `glossary.write` MCP tool description no longer claims it can write an
inline glossary; it needs a file-backed one and fails with `GLOSSARY_NOT_FILE_BACKED` otherwise.
