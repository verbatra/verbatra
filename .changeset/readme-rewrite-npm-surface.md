---
"@verbatra/sdk": patch
"@verbatra/cli": patch
"@verbatra/studio": patch
"@verbatra/mcp": patch
---

Rewrite the README each package publishes to npm.

Every package now carries the same header (mark, name, its own one-sentence description, its own
version badge and no other package's), absolute image URLs so the artwork renders on npmjs.com, and
no relative links, which never resolve there.

The bodies drop the reference material the documentation site owns and would drift from: the
configuration schema, the exit-code contract, and the per-provider key table are links now. What is
left is what a reader on the package page needs. `@verbatra/cli` carries the command table derived
from its own command registrations, one line each and no flags. `@verbatra/sdk` caps its API
reference at what the built `dist/index.d.ts` actually declares. `@verbatra/studio` gains a
screenshot of the dashboard and states the loopback bind and the `--allow-spend` gate up front.
`@verbatra/mcp` gains the full thirteen-tool table and names the two tools the spend gate hides.

No runtime behavior changes.
