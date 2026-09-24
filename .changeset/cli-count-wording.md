---
"@verbatra/cli": patch
---

Match the noun to its count in the human output of `export`, `pseudo`, `extract`, `types`,
`diff --unused`, `translate`, `import`, `tmx export`, and `tmx import`.

Previously a count of one still read as plural, for example `1 rows across 1 locales`,
`1 units read`, or `1 of 1 entries pseudolocalized`.

Now a count of one takes the singular noun and, where the line has one, the singular verb:
`1 row across 1 locale`, `1 unit could not be read and was skipped`. JSON output is unchanged.
