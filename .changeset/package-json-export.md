---
"@verbatra/sdk": patch
"@verbatra/cli": patch
"@verbatra/mcp": patch
"@verbatra/studio": patch
---

Export each package's own `package.json`.

Previously `require.resolve("@verbatra/sdk/package.json")` and
`import pkg from "@verbatra/sdk/package.json" with { type: "json" }` failed with
`ERR_PACKAGE_PATH_NOT_EXPORTED`, because the `exports` map did not list it, so tools reading a
package's version or metadata could not reach it. The same held for `@verbatra/cli`,
`@verbatra/mcp` and `@verbatra/studio`.

Now every one of the four lists `./package.json` in its `exports`.
