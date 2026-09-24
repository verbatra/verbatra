---
"@verbatra/sdk": patch
---

Report `empty` and `icu` ahead of `placeholder` and `markup` when the integrity gate refuses a value.

Previously an empty value for a source with a placeholder or a tag was refused as `placeholder` or
`markup`, and an ICU message that does not parse, such as a `plural` without its `other` arm, was
refused as `placeholder` with the placeholder the parser could no longer find.

Now the gate checks for an empty value first and for an unparsable ICU message second, so those
refusals carry `empty` and `icu`. Which values are refused is unchanged.
