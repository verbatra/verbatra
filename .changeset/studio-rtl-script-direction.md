---
"@verbatra/studio": patch
---

Show every locale written in a right-to-left script right to left.

Previously Studio treated only `ar`, `he`, `fa` and `ur` as right to left, so Pashto, Sindhi,
Uyghur, Yiddish, Dhivehi, Sorani Kurdish, Syriac and others were shown left to right. Studio now
asks the browser for the locale's text direction and, where the browser cannot say, uses the
locale's likely script, so `ku-Arab` is right to left while `ku` stays left to right. A tag that
cannot be parsed is shown left to right. The script is also the fallback when the browser's
`Intl.Locale` text info throws, and the result is remembered per locale tag.
