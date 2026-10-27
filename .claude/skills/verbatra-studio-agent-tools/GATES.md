# Gates and limits

## Two gates, not one

Studio decides twice what an agent may do, and the two decisions are independent.

1. **Agent tools at all.** Nothing is registered unless the operator started
   Studio with `--expose-agent-tools` (or `VERBATRA_STUDIO_AGENT_TOOLS` in its
   environment). Without it the dashboard works normally and the page exposes no
   tools whatsoever. If you see no `verbatra_` tools, this is why.
2. **Spend.** With agent tools on, the tools that call a translation provider,
   `verbatra_translation_retranslateEntry` and
   `verbatra_translation_translatePending`, are still skipped during registration
   unless Studio was also started with `--allow-spend` (or
   `VERBATRA_STUDIO_ALLOW_SPEND`) and the config names a translation provider.
   The other eighteen register either way. `verbatra_project_snapshot` says which:
   `capabilities.spend` is true only when both hold, and when it is false,
   `capabilities.spendWithheld` is `flag` (spend was not granted) or `policy` (the
   project is human-only, provider `none`, so no flag can grant it).

Neither gate can be flipped from the browser. You may tell the human which flag
would change what, but say plainly that granting spend means Studio will bill the
configured provider. Never present a re-launch as a fix for a missing tool.
A spend method reached while spending is off answers `SPEND_DISABLED` (HTTP 403),
and its message names the reason: Studio was started without `--allow-spend`, or
the config's provider is `none`, which `--allow-spend` does not change.

Local editing and pricing are never gated. `verbatra_translation_editEntry`,
`verbatra_glossary_write`, `verbatra_translation_estimate`,
`verbatra_review_approve` and `verbatra_review_reject` are always registered when
agent tools are on, because they call no provider.

A review decision is a person's. `verbatra_review_approve` and
`verbatra_review_reject` exist so you can relay one, never so you sign off your
own work: call them only when the user has read the value and told you which
decision to record, pass the text they reviewed as `expectedValue`, and pass the
name they give you as `reviewer`, which is required and stored publicly in the
committed `verbatra.provenance.json`. Never invent a reviewer. The bulk forms
`review.approveMany` and `review.rejectMany`, and `review.approveLocale`, which
approves a whole locale's queue, are never registered as tools. The same holds for
`translation.retranslateEntries`, the dashboard's retranslate-a-selection action,
and `translation.inFlight`, which only tells the page whether a run is already
going. There is no agent tool for any of them; act on one key at a time with the
tools in [TOOLS.md](TOOLS.md), and leave bulk decisions to the person at the dashboard. The
dashboard's keyboard shortcuts drive the same human-only actions and are not
something an agent triggers. When a person rejects a value, it
is removed from the locale file; an `xliff` project refuses that with
`REVIEW_REJECT_UNSUPPORTED`, since a unit without a target reads as its source,
while every other format, `arb` included, allows it.

Registered is not the same as usable. `verbatra_glossary_write` needs a
file-backed glossary: on a project whose glossary is inline in the config, or
absent, every call fails with `GLOSSARY_NOT_FILE_BACKED` and retrying will not
help. `verbatra_project_snapshot` and `verbatra_glossary_get` both report where
the glossary comes from, so read that before you try to write a term.

Registered is not unlimited either. Studio rate-limits the methods that write or
spend, and `verbatra_project_snapshot` reports two of those limits as
`capabilities.limits.retranslate` and `capabilities.limits.reviewDecision`, each
`{ windowMs, max }`. The review one bounds decisions only a person makes, so the
retranslate one is the limit you can run into. A call over its limit fails with
`METHOD_RATE_LIMITED` and carries `error.retryAfterSeconds`: wait that long
instead of retrying at once, and do not loop on it.
