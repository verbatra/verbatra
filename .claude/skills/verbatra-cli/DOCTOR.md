# The doctor command

## doctor

`verbatra doctor --json` returns `result.ok` and one entry per check in
`result.checks`, each with an `id` and a `status` of `pass`, `warn`, `fail` or
`skipped`, always these eleven in this order:

| Check id | What it answers |
| --- | --- |
| `config` | The config loads and validates. |
| `format-adapter` | The configured format resolves to an adapter. |
| `provider` | The provider id resolves; provider `none` passes as machine translation disabled by policy. |
| `api-key` | The provider's key variable is set, by name only; `none` passes without looking. |
| `network-policy` | The effective network policy permits the provider's host. |
| `source-file` | The source locale file exists and parses. |
| `plural-rules` | Informational: the ICU and CLDR versions plural categories come from, and any target locale ICU has no rules for. |
| `plural-completeness` | Informational: each plural in a target locale file that lacks CLDR categories its language uses, as `check` reports them; `skipped` when the format does not store plural forms by CLDR category. |
| `locale-codes` | Informational: configured codes that are valid but not canonical BCP 47, with the canonical spelling. Nothing is renamed. |
| `locale-state` | Informational: locales the lock file, translation memory or provenance file hold state for that the config does not list, and what the next `translate` does about them. |
| `locales` | The provider supports the source and every target locale; fails on the locale `translate` would refuse, `warn` when a locale carries a support warning or a `--live` fetch failed, `skipped` for provider `none`. The per-locale report is in `result.locales`. |

The informational checks never fail: they report `warn` when they name something
worth attention and `pass` otherwise. Only `fail` sets `result.ok` to false and
makes `doctor` exit `1`; `warn` and `skipped` never change `ok` or the exit code.
The human report prints `[warn]` for such a check and ends with `no problems found`
(`no problems found, 2 warnings` when checks warned). Every check but `config`
reports `skipped` when `config` itself failed. With `--literals` the run has exactly two checks,
`config` and `untranslated-literals`. With `--data-flow` it has exactly two too,
`config` and `data-flow`, and `--data-flow` cannot be combined with `--literals`,
`--locales` or `--live` (`INVALID_OPTION`, exit `2`). With `--json` the data-flow
manifest is in `result.dataFlow`; its `version` is `1` and changes only when a
field is renamed or removed, so ignore fields you do not know. Branch on `id`,
never on `title` or `detail`. A failed check also carries `fix`, one imperative
next step (printed as a `fix:` line in the human report); a passed or skipped
check has none.

### Checks that replace the setup run

| Check id | What it answers |
| --- | --- |
| `untranslated-literals` | Only with `--literals`: the `extract` source roots hold no hardcoded user-facing string and no file the scan could not read; fails otherwise. |
| `data-flow` | Only with `--data-flow`, informational: what is sent to which host and what is written locally. `pass`, or `warn` when the network policy refuses a host or holds an invalid value, or the source cannot be read for the counts; never `fail`. |
