# Spend boundary reference

## The spend boundary

The server registers twenty-two tools but advertises only twenty by default. The
tools that call a translation provider, `translation.retranslateEntry` and
`translation.translatePending`, are filtered out of the tool list entirely unless
the operator started the server with the spend capability granted
(`verbatra mcp --allow-spend`, or `VERBATRA_MCP_ALLOW_SPEND` in its environment,
which `verbatra mcp` also reads from the project's `.env.local` and `.env`)
and the config names a translation provider. A project whose `project.snapshot`
reports provider `none` is human-only: those tools stay absent even with spend
granted, and nothing will make them appear short of the human changing the
provider.

So if you cannot see those tools, nothing is broken. The operator decided this
session does not spend money. You may say that re-launching with `--allow-spend`
would expose them, but you must say in the same breath that those tools bill the
configured provider per run. Never present it as a fix for a missing tool.
Calling a spend tool that is not listed fails as an MCP protocol error,
`Unknown tool: <name>`, not as a tool result with a code; this server has no
`SPEND_DISABLED` code.

Everything else, including writing a corrected translation with
`translation.editEntry`, editing the glossary with `glossary.write`, pricing a
run with `translation.estimate`, and recording a person's review decision with
`review.approve` or `review.reject`, is always registered and calls no provider.

The server also sends MCP `instructions` on connect that restate this order of
work, the spend boundary, protected keys, untrusted content, redaction and the
result shape; read them, they come from the same source as the tools.

Registered is not the same as usable. `glossary.write` needs a file-backed
glossary: on a project whose glossary is written inline in the config, or has
none at all, every call fails with `GLOSSARY_NOT_FILE_BACKED` and no retry will
change that. `project.snapshot` and `glossary.get` both report where the glossary
comes from; read that first, and if it is inline, tell the human the config has
to point at a JSON file before the term can be edited.
