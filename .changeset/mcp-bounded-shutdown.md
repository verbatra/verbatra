---
"@verbatra/mcp": patch
---

Stop `verbatra-mcp` promptly on an interrupt and release the locale locks it holds.

An interrupt now closes the server with a two second deadline, releases every held locale lock, and
exits 0, even while a `translation.translatePending` call waits on the provider. A second
interrupt during shutdown releases the locks and exits 130 after SIGINT or 143 after SIGTERM, the
same bounded shutdown `verbatra mcp` has.
