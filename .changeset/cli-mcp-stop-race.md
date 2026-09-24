---
"@verbatra/cli": patch
---

Exit `verbatra mcp` with code 1 whenever closing the server on an interrupt fails.

Previously a client disconnect that settled while an interrupt was still closing the server could
end the command with exit 0, even though the close then failed and its error was printed. The
outcome of an interrupt now decides the exit code in either order, and an interrupt that arrives
after the client already disconnected keeps the clean exit 0.
