---
"@verbatra/sdk": patch
---

Give CommonJS consumers the CommonJS type declarations.

Previously the package's `exports` shared one `types` entry, `index.d.ts`, across `import` and
`require`, so TypeScript under `node16` or `nodenext` treated a `require("@verbatra/sdk")` as an
ES module and refused it. Each condition now names its own declarations: `import` resolves to
`index.d.ts` and `require` to `index.d.cts`.
