---
"@verbatra/sdk": minor
"@verbatra/cli": minor
"@verbatra/studio": patch
"@verbatra/mcp": patch
---

Turn `budgetBehavior: "stop"` into an enforceable ceiling, and stop the budget being inert for
providers that report no usage.

`maxTokens` was counted after a sub-batch had already been paid for, so a `stop` run overshot its
ceiling by one sub-batch, and it counted nothing at all for DeepL or Google Cloud Translation,
which report no token usage. A run now projects each provider request before it is sent, using the
same projection the pre-run estimate reports, and under `stop` refuses to send a request that would
take the run past `maxTokens`. After every request the count is reconciled to the usage the
provider actually reported, because the provider is the authority on what was billed; a request
that reported nothing keeps its projection instead of counting zero.

The reservation is taken per request actually sent, not per planned batch, so a request that
verbatra re-splits after a truncated response has each half checked in turn and a cascade of retries
cannot outrun one reservation. A request that fails or comes back truncated keeps its whole
projection charged rather than being refunded, because such a call has usually already billed for
its prompt, and a report of zero or less is treated as no report at all rather than as a refund.
Every projection carries a fixed allowance for the prompt, DeepL and Google Cloud Translation
included, so a ceiling below one batch's projection refuses that batch on every run; the refusal
notice now says so whenever the refused projection alone is above `maxTokens`, and names lowering
`maxBatchSize` or raising `maxTokens` as the way out.

A reported figure is normalized before it is counted or added to another request's figure, the
halves of a re-split request included: each field is floored at zero and rounded to a whole number,
so a negative field can no longer cancel a positive one down below the invoice and a fractional
report can no longer produce a run-status file the reader then refuses, which used to lose the whole
run record rather than just the budget.

What a reservation cannot bound is what happens inside a request it already admitted, and that is
documented rather than hidden. The provider layer sends one repair call of its own when keys come
back missing, so one admitted batch can cost up to about twice its projection; a request can report
more than it was projected to cost; and the count is only as good as what the provider reports. All
of it lands at reconciliation, and nothing further is sent once it does. Withheld keys keep their
prior lock hash and retry on the next run, exactly as before, so a stopped run leaves no
half-written locale file and no lock entry claiming work that was withheld.

The ceiling bounds one run, not a session: `watch` starts a fresh budget for each run it triggers,
so a watch session can spend up to `maxTokens` again on every source edit. It covers `translate`
and nothing else; `retranslateEntry`, reached from the Studio dashboard and the agent tools,
constructs its own provider and is not capped by it. Both limits are now stated in the docs and in
the published `RunBudget` type rather than left to be inferred.

Behavior breaks, both on paths a user opted into:

- With `budgetBehavior: "stop"`, a run now gets strictly less work done for the same ceiling, since
  the sub-batch that used to be paid for and accepted is now withheld. Nothing is lost (withheld
  keys retry next run), but a single run's output changes. Set `budgetBehavior: "warn"` to keep the
  previous permissive behavior.
- A `maxTokens` set against DeepL or Google Cloud Translation used to do nothing and report itself
  as unsupported. It is now enforced from an estimated count, so such a run can stop early. Under
  the default `warn` it still withholds nothing; it only reports a figure where it used to report
  none.

`budgetBehavior` keeps `warn` as its default, so a run that never set it withholds nothing.
`RunBudget.supported` keeps its type and changes meaning: it now says whether `tokensUsed` is
entirely the provider's own reported usage, rather than whether the budget can be enforced, because
the budget is enforced either way. It is `false` as soon as one counted request came back without a
usable figure, a failed or truncated request included. The CLI budget line no longer claims a budget
is "not supported by this provider"; it prints the counted total, marked estimated when the count is
not entirely the provider's, and says a `stop` run that withheld a request while its count was still
under the ceiling stopped before the ceiling rather than calling it exceeded. Studio's budget tile
and its translations stat strip now show the consumption and the ceiling-reached state for an
estimated budget instead of collapsing to an untracked placeholder, and tell a run stopped before
its ceiling apart from one that reached it. The `usage.summary` agent tool's description now says
where the counted figure came from rather than implying the provider reported it. A run with no
`maxTokens` configured is unchanged: no projection is computed and no summary field moves.

Because `supported: false` used to mean that nothing was counted at all, the run-status snapshot in
`.verbatra-local/run-status.json` now carries a marker field saying its budget was counted under the
enforced rules, and keeps its version. A snapshot without that marker is still read, but a budget it
recorded with `supported: false` is dropped rather than presented as a count of zero, so Studio and
the `usage.summary` agent tool no longer show an older DeepL or Google Cloud Translation run as
within budget. An older Studio or MCP server ignores the marker and keeps reading the snapshot,
review queue and usage included; until it is upgraded, it may show an estimated budget as not
tracked. The `usage.summary` description also says that a run which sent no request at all reports
`supported: false` with nothing counted, which is no estimate.

The refusal to combine `maxTokens` with `--concurrency` above 1 on a live run is deliberately kept.
The reservation is taken synchronously, so the ceiling would hold across concurrent locales, but
which locale loses its remaining work would depend on the order the locales interleave. That reason
now replaces the old claim of a nondeterministic overshoot everywhere it was written: the thrown
error, the published `SdkErrorCode` documentation, the SDK README, and the `translate` and `watch`
command pages in all four locales.
