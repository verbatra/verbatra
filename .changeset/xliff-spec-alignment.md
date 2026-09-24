---
"@verbatra/sdk": patch
---

Match XLIFF inline elements, attributes and segment states to the XLIFF 1.2 and 2.0 specifications.

Previously both versions shared one inline allow-list, so `x`, `g`, `bx`, `ex` and `it` stayed
live in XLIFF 2.0 and `em` counted as a placeholder in XLIFF 1.2, and several specified attributes
(such as `xid`, `crc` and `assoc` in 1.2, or `ref` and `subFlows` in 2.0) were stripped on write.
A translated value quoting `<!DOCTYPE` or `<!ENTITY` failed the write, an XLIFF 2.0 segment in
state `initial` stayed `initial` after a translation was written, and an unreadable source file
was reported as having no unit to copy.

Now each version keeps exactly its own inline elements and their specified attributes, a 1.2
`sub` stays live inside `bpt`, `ept`, `ph` and `it`, and placeholders follow the document's
version. Such a value is written as text, a written segment in state `initial` becomes
`translated` and loses its `subState`, a target equal to its source in an explicitly `initial`
segment reads as missing, and an unreadable or invalid source file gets its own
`INVALID_STRUCTURE` message. A copied unit drops only its own targets and `alt-trans`, and a key
that is not a valid XLIFF 2.0 unit id, such as `u1#0`, is refused rather than written as a new
source unit. Apple `.strings` comments are also scanned in linear time.
