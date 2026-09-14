---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add two format adapters: `ini` for classic INI files, and `resx` for .NET XML resource files.

`ini` reads one level of `[section]` headers over `key=value` lines, addressed as `section.key`, and guards single-brace placeholders. `resx` reads `<data name>`/`<value>` pairs, carries a `<comment>` across as the entry description, and guards .NET composite format items including alignment and format specifiers.

Both write by patching the destination document in place, so comments, spacing, the `.resx` schema preamble, and `.resx` entries holding serialized objects or designer metadata survive untouched.
