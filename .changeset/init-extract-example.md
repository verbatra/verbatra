---
"@verbatra/cli": patch
"@verbatra/sdk": patch
---

Show how to configure `extract`.

- **Init:** for the `i18next-json` format, the generated `verbatra.config.ts` now ends with a commented `extract: { framework: "i18next", roots: ["src"] }` line to uncomment. Other formats are unchanged.
- **Error hint:** the hint for `EXTRACT_NOT_CONFIGURED` now shows the block, `extract: { framework: "i18next", roots: ["src"] }`, where it used to name only the framework and source roots in words.
- **Upgrade:** the hint text is longer; a script that matches the old sentence exactly ("Add an `extract` block to the config naming the framework and source roots.") should match the error code `EXTRACT_NOT_CONFIGURED` instead.
