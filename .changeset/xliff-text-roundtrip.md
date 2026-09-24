---
"@verbatra/sdk": patch
---

Read and write XLIFF text escaped exactly once, and keep XLIFF paired and 2.0 inline codes live.

Previously a value such as `A & B` was written as `A &amp; B` but read back as `A &amp; B`, so
every rewrite could grow the escaping, and translators, the provider and the integrity checks saw
entities instead of text. A value mixing inline markup with a bare `&` or `<` lost its markup.

Now text is decoded on read and escaped once on write, inline elements stay live around it, and
`&`, `<`, `>`, quotes and existing entities read back exactly as written. `bpt` and `ept` in
XLIFF 1.2 and `pc`, `sc`, `ec`, `sm`, `em` and `cp` in XLIFF 2.0 join the inline allow-list and
count as placeholders. An XLIFF value that contained an entity is read as plain text once, so
its key may show as changed on the first run after upgrading.
