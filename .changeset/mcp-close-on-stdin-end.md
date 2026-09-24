---
"@verbatra/mcp": patch
---

Close the server when the client closes stdin, and expose that on the handle as `closed`.

Previously the server kept its transport open after stdin ended, and an embedder had no way to
learn that the client was gone. `startMcpServer` now closes the server once stdin ends, and the
returned handle's `closed` promise settles when the server has closed, whether through `close()`
or because the client disconnected.
