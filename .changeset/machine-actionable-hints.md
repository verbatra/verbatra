---
"@verbatra/sdk": minor
"@verbatra/cli": minor
"@verbatra/mcp": minor
---

Tell an agent or a script what to do next when something fails, instead of leaving it to parse the
message.

- `errorHint(error)`, new in `@verbatra/sdk`, returns one short imperative next step for any SDK,
  provider, or format adapter error code, such as "Set GEMINI_API_KEY in the environment or in a
  .env file in the project directory." or "Run `verbatra init` to create a config". A missing key
  names the exact variable to set, never its value. `ProviderError` gains `envVar`, the variable
  name a `MISSING_API_KEY` failure is about.
- `DoctorCheck` gains `fix`, the next step for a failed check. `verbatra doctor` prints it under
  the check, and `doctor --json` carries it.
- The `ok: false` JSON envelope gains an optional `hint`, and the human error line is followed by a
  `next:` line with the same text. A command-line the argument parser rejects (an unknown option, a
  missing argument) keeps its `USAGE_ERROR` code and exit 2, and now carries a hint naming the
  command's `--help`. A failed `watch` run record carries `hint` too. The envelope stays at
  version 1, since the field is additive.
- A failed MCP tool call ends its text with a `Next step:` line when the error has a hint.
