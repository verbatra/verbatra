---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `android-xml`, a new supported format, for Android's `res/values/strings.xml`
and `res/values-<qualifier>/strings.xml` resource files. Plurals are read and
written as separate entries per quantity (`zero`, `one`, `two`, `few`, `many`,
`other`), and printf-style placeholders (`%s`, `%1$s`) are guarded across
translation. Entries marked `translatable="false"`, `<string-array>` elements, and
strings containing inline markup are left untouched. Writes preserve existing file
structure and create missing destination directories.
