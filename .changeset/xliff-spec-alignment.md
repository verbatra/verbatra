---
"@verbatra/sdk": patch
---

Match XLIFF inline elements, attributes and segment states to the XLIFF 1.2 and 2.0 specifications.

Previously both versions shared one inline allow-list, so `x`, `g`, `bx`, `ex` and `it` stayed
live in XLIFF 2.0, and several specified attributes (such as `xid`, `crc` and `assoc` in 1.2, or
`ref` and `subFlows` in 2.0) were stripped on write.
A translated value quoting `<!DOCTYPE` or `<!ENTITY` failed the write, and an XLIFF 2.0 segment in
state `initial` stayed `initial` after a translation was written.

Now each version keeps exactly its own inline elements and their specified attributes, and a 1.2
`sub` stays live inside `bpt`, `ept`, `ph` and `it`. A read entry's placeholders and the
placeholder comparison both cover the inline elements of either version, so an element dropped
from a value is reported once, as a placeholder. A value quoting `<!DOCTYPE` or `<!ENTITY` is
written as text, a written segment in state `initial` becomes `translated` and loses its
`subState`, a target equal to its source in an explicitly `initial` segment reads as missing, and
an unreadable or invalid source file gets its own `INVALID_STRUCTURE` message, carrying the
parser's error as its `cause`.
