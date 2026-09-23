---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Let `verbatra init` run end to end without a person: `--format`, `--json`, `openai-compatible`,
and detection from the locale files already in the project.

Previously `init` guessed the format from `package.json` alone, had no `--format` or `--json` flag,
could not scaffold an `openai-compatible` provider, silently took defaults when stdin was not a
terminal, exited 2 without an error code when `--provider` was missing, and skipped an existing
`verbatra.config.ts` while still exiting 0.

Now:

- `init` scans the project for locale files and detects the format, the `files.pattern`, the
  `files.localeStyle`, the source locale and the target locales from them. A value passed as a flag
  always wins. When several formats or file patterns fit, it exits 2 with `FORMAT_AMBIGUOUS` or
  `LAYOUT_AMBIGUOUS` and lists the candidates instead of guessing.
- New flags: `--format <id>`, `--model <name>`, `--base-url <url>`, `--api-key-env-var <name>` and
  `--json`. `--provider openai-compatible` needs `--base-url` and `--model`; the key variable is
  only ever named, never written, and a base URL carrying credentials, a query string or a
  fragment is refused.
- `--json` prints one envelope listing the config path, every file written and what happened to
  it, the resulting config, where each value came from, the detection with its confidence and
  reasons, the key variable and the next commands to run. It never prompts.
- Without a terminal, or with `--json`, a value that is neither passed, detected nor defaulted by
  `--yes` fails with `MISSING_OPTIONS`, naming every missing flag. An unknown provider or format
  fails with `INVALID_PROVIDER` or `INVALID_FORMAT`, and a flag that does not fit the provider with
  `INVALID_OPTION`.
- Running `init` again with the same resulting config changes nothing and exits 0. A
  `verbatra.config.ts` with different content is refused with `CONFIG_EXISTS` unless `--force` is
  given. Another verbatra config file in the directory, which would be read first, is refused with
  `CONFIG_EXISTS` even under `--force`.
- An existing `.env.example` is no longer skipped or overwritten: the key variable is appended when
  it is missing.
- A base file beside the locale files that names no locale, such as `messages.properties`,
  `Strings.resx` or a gettext `.pot` template, is reported, and `--source` is then required even
  with `--yes`; the next steps say which file verbatra reads the source from.
- An error for an ambiguity or an invalid flag also lists every flag still missing, so one run
  reports everything an agent has to pass.
- An error envelope may carry a `candidates` list and a `missing` list.

Compatibility: `init --yes` in a project whose locale files or dependencies fit several formats,
such as plain JSON next to both `i18next` and `vue-i18n`, used to write `i18next-json` with a TODO
comment and now exits 2 with `FORMAT_AMBIGUOUS`; pass `--format`. A non-interactive `init` without
`--yes` now fails with `MISSING_OPTIONS` instead of taking defaults silently.

The SDK exports `detectProject`, which performs the detection, and `scaffoldingMetadata` gains
`openAiCompatibleKeyEnv` and `configSearchPlaces`.
