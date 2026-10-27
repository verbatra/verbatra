# Exit codes and the JSON envelope

## Exit codes

Branch on the exit code first. It is the one signal that combines "did the command
run" with "did the work land".

| Code | Meaning |
| --- | --- |
| `0` | Success: nothing outstanding, or everything requested completed. |
| `1` | It ran, the result is not clean: a locale failed or is partial, `check` found drift or, with `--qa`, an integrity error (a review warning or an incomplete plural too under `--strict`), with `--require-reviewed`, an unapproved machine-written value, or, with `--sensitive`, sensitive content, `check --file` found a syntax or integrity error (a review warning or an incomplete plural too under `--strict`), `diff` found pending keys or, with `--unused`, a complete scan found unused source keys, `report provenance` could not read the provenance file, `doctor` found a failed check or, with `--literals`, an untranslated literal or an unreadable source file, `types --check` found the committed declaration out of date. |
| `2` | It could not run: bad config, unreadable source, corrupt lock file, a network policy that refuses the provider's host, a locale the provider does not support, `mcp --redact-values` with a `@verbatra/mcp` too old to redact, a `watch` that could not start (such as a provider whose key variable is unset), or a usage error such as an unknown `--locales` value. `init` also exits `2` when a flag it needs is missing, when several formats or file patterns fit, or when it refuses to replace an existing config. |
| `3` | `translate` (a dry run and `--estimate` included) in a human-only project (provider `none`) finished cleanly but left keys that need a human translation. |
| `130` | `watch`, `studio` or `mcp` was force-stopped by a second interrupt (all three return the same stoppable session), or `translate` or `import` was interrupted with SIGINT. |
| `143` | `translate` or `import` was stopped with SIGTERM. |

Two things that catch scripts out:

- A `--json` envelope with `ok: true` does not mean every locale succeeded. It
  means the command ran and produced a summary. A locale that failed inside that
  run shows up in `result.failed` and `result.partial`, and the exit code is `1`.
  An agent that reads only `ok` is wrong the first time a provider has a bad day.
- A **partial** locale is a failure. The file was written with some keys still
  missing, usually because a sub-batch failed or the integrity gate refused a
  translation. It exits `1` exactly like a failed locale.
- Exit `3` is not a failure and not success either: nothing broke, and the keys in
  `result.locales[].unfilled` (plus any protected keys) are waiting for a person.
  Hand them off with `export`; retrying `translate` changes nothing.

An interrupted `translate` or `import` deletes the write locks it holds before it
exits, so the next run does not wait on them, and ends stderr with
`verbatra: interrupted (SIGINT), released locks` (under `--json`, the record
`{"type":"interrupted","signal":"SIGINT","locksReleased":true}`). A lock left behind by a process that
was killed outright is reclaimed automatically by the next run on the same machine
once that process is gone; one left by another machine or an older verbatra is
not, and the locale fails with `LOCK_CONTENDED` naming the lock file under
`.verbatra-local/locks/`. A lock whose process is still alive but whose file has
not been refreshed for three heartbeat intervals is treated as abandoned too. A
holder checks that the lock is still its own before every write it protects, and
stops with `LOCK_CONTENDED` without writing when another process has taken it
over. While a run waits for a lock another process holds, it says so on stderr
once the wait passes a second (a `{"type":"lock-wait"}` record under `--json`);
delete the named file only when no verbatra process is running.
`--lock-timeout <seconds>` (default 600, at most 3600) on `translate`, `watch` and
`import` bounds only the waits before any provider call or write: the locale write
lock and the lock-file guard for a respelled locale's state. The guard taken to
record a file the run already wrote always allows the ten-minute default, so a
written file is never left unrecorded.

Do not run a verbatra gate under `set -e`: a non-zero exit is the answer you asked
for, not a crash.

## The JSON envelope

Every `--json` record is one line with the same envelope, so you branch on one
field and never guess which command's payload you are holding:

```ts
type Envelope<TResult> =
  | { ok: true; version: 1; command: string; result: TResult }
  | {
      ok: false;
      version: 1;
      command: string | null;
      code: string;
      message: string;
      causeCode?: string;
      candidates?: string[];
      missing?: string[];
      hint?: string;
    };
```

`version` is the envelope's shape version, not the package version. New fields can
appear without a bump, so ignore fields you do not recognize. On an `ok: false`
record, branch on `code`, never on `message`. A command line commander itself
rejects, such as an unknown flag, carries `USAGE_ERROR`. `candidates` lists the values that
would have been accepted and `missing` the flags that still have to be passed, so
an agent can retry with a flag instead of parsing prose. `causeCode` names the
coded error a failure wraps, such as `MISSING_API_KEY` under
`PROVIDER_CONSTRUCTION_FAILED`, and the stderr line ends with `(cause: <code>)`. `hint`, when
present, is one imperative next step, such as `Set GEMINI_API_KEY in the environment, or, with the CLI,
in a .env file in the project directory.` or, for `USAGE_ERROR`, `` Run `verbatra check --help` ... ``:
act on it instead of parsing `message`. It names a variable, never a key value, so never ask the
user for the value it names; ask them to set the variable. Without `--json` the same text follows
the error line on stderr as `next: ...`. Progress records and the
human-readable error line always go to stderr, so stdout is a clean stream of
envelopes.

`watch --json` is a stream, not a payload: one envelope per run as NDJSON for the
life of the process. A failed run is a record on that stream. It does not stop the
watcher and does not change the exit code, so treat it as an event to report, not
a reason to restart the process. A failure before watching starts is different:
a config that does not load, a missing source file or a provider that cannot
be built, most often because its key variable is unset, ends `watch` with exit `2`
and one error envelope, and it never waits for changes.

Every `--json` record has a JSON Schema (draft 2020-12):
`https://verbatra.kreitz-webdev.de/schema/v1/envelope.json` (any envelope),
`.../<command>-envelope.json` (one command's envelope with its result),
`.../error-envelope.json` and `.../stderr-record.json` (progress, lock-wait and
interrupted lines on stderr). The index is
`https://verbatra.kreitz-webdev.de/schema/v1`. Offline copies ship in
`@verbatra/cli/schemas/` (every envelope and result) and `@verbatra/sdk/schemas/`
(the results and the config, without the envelopes). Schemas allow unknown fields,
so validate, then ignore fields you do not know.
