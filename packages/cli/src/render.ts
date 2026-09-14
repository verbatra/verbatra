import type {
  CheckSummary,
  DiffSummary,
  DoctorCheckStatus,
  DoctorResult,
  EstimateCaveatCode,
  ExportWorkbookResult,
  ExtractResult,
  FuzzyCacheHit,
  LocaleDiff,
  LocaleSummary,
  LockWaitEvent,
  ProgressEvent,
  PseudolocalizeResult,
  RunBudget,
  RunEstimate,
  RunSummary,
  UsageSummary,
  WatchRunResult,
} from "@verbatra/sdk";

export interface RenderableError {
  readonly code: string;
  readonly message: string;
}

export function toRenderableError(error: unknown): RenderableError {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return { code: typeof code === "string" ? code : "CLI_ERROR", message: error.message };
  }
  return { code: "CLI_ERROR", message: String(error) };
}

export function renderHuman(summary: RunSummary, command = "translate"): string {
  const header = summary.dryRun ? `verbatra ${command} (dry run)` : `verbatra ${command}`;
  const localeLines = summary.locales.flatMap(renderLocaleLine);
  const aggregate = `${summary.succeeded.length} succeeded, ${summary.partial.length} partial, ${summary.failed.length} failed${
    summary.dryRun ? " (dry run: nothing written)" : ""
  }`;
  const usageLine = summary.usage !== undefined ? [`  total: ${renderTokens(summary.usage)}`] : [];
  const budgetLine = summary.budget !== undefined ? [renderBudgetLine(summary.budget)] : [];
  const estimateLines = summary.estimate !== undefined ? renderEstimateLines(summary.estimate) : [];
  return [header, ...localeLines, ...usageLine, ...budgetLine, ...estimateLines, aggregate].join(
    "\n",
  );
}

function renderTokens(usage: UsageSummary): string {
  return `${usage.inputTokens + usage.outputTokens} tokens (${usage.inputTokens} in, ${usage.outputTokens} out)`;
}

function renderBudgetLine(budget: RunBudget): string {
  if (!budget.supported) {
    return (
      `  budget: ${budget.maxTokens} tokens configured (${budget.behavior}), ` +
      "not supported by this provider (no usage reported)"
    );
  }
  const status = budget.exceeded ? "exceeded" : "within budget";
  return `  budget: ${budget.tokensUsed}/${budget.maxTokens} tokens (${budget.behavior}), ${status}`;
}

const COST_DECIMALS = 4;
const SMALLEST_PRINTABLE_COST = 0.00005;
const SMALLEST_PRINTED_COST = "0.0001";

function renderCostFigure(cost: number, currency: string): string {
  return cost > 0 && cost < SMALLEST_PRINTABLE_COST
    ? `less than ${SMALLEST_PRINTED_COST} ${currency}`
    : `${cost.toFixed(COST_DECIMALS)} ${currency}`;
}

const CAVEAT_PHRASES: Record<EstimateCaveatCode, string> = {
  CACHE_NOT_CONSULTED: "cache hits",
  SOURCE_DUPLICATES_NOT_DEDUPLICATED: "duplicate source strings",
  TRANSPORT_RETRIES_NOT_COUNTED: "provider-side retries",
  TRANSLATION_LENGTH_IS_ESTIMATED: "translation length",
  TOKEN_COUNT_IS_HEURISTIC: "tokenizer differences",
  REPAIR_REQUESTS_NOT_COUNTED: "repair requests",
};

function renderEstimateScale(estimate: RunEstimate): string {
  switch (estimate.unit) {
    case "tokens":
      return `~${estimate.inputTokens} input + ~${estimate.outputTokens} output tokens`;
    case "characters":
      return `~${estimate.sourceCharacters} source characters`;
  }
}

function renderEstimateQuantity(estimate: RunEstimate): string {
  const scale = renderEstimateScale(estimate);
  return `  estimate: ${estimate.keys} keys in ${estimate.requests} requests, ${scale}`;
}

function renderEstimateCost(estimate: RunEstimate): string {
  switch (estimate.pricing) {
    case "priced":
      return (
        `  estimated spend: ${renderCostFigure(estimate.cost, estimate.currency)} ` +
        `at rates as of ${estimate.asOf} (a planning estimate, not a quotation)`
      );
    case "no-rate-on-file":
      return (
        `  estimated spend: no rate on file for ${estimate.rateKey}; ` +
        `add rates.table["${estimate.rateKey}"] to your config to see a currency figure`
      );
    case "rate-unit-mismatch":
      return (
        `  estimated spend: the rate on file for ${estimate.rateKey} is not priced in ` +
        `${estimate.unit}; correct rates.table["${estimate.rateKey}"] in your config`
      );
    case "not-billed":
      return `  estimated spend: no API cost, ${estimate.rateKey} is self-hosted`;
  }
}

function renderEstimateCaveats(estimate: RunEstimate): string {
  const phrases = estimate.caveats.map((code) => CAVEAT_PHRASES[code]);
  return `  estimate excludes: ${phrases.join(", ")}`;
}

function renderEstimateLines(estimate: RunEstimate): readonly string[] {
  return [
    renderEstimateQuantity(estimate),
    renderEstimateCost(estimate),
    renderEstimateCaveats(estimate),
  ];
}

const DETAIL_GROUP_WIDTH = 17;

function renderDetailGroup(label: string, values: readonly string[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return `    ${`${label}:`.padEnd(DETAIL_GROUP_WIDTH)}${values.join(", ")}`;
}

const FUZZY_SOURCE_PREVIEW = 40;

function previewSource(source: string): string {
  return source.length <= FUZZY_SOURCE_PREVIEW
    ? source
    : `${source.slice(0, FUZZY_SOURCE_PREVIEW)}...`;
}

function renderFuzzyHit(hit: FuzzyCacheHit): string {
  const percent = Math.round(hit.similarity * 100);
  return `${hit.key} (${percent}% like "${previewSource(hit.previousSource)}")`;
}

function renderPosition(at: { readonly row: number; readonly line?: number }): string {
  return at.line === undefined ? `row ${at.row}` : `row ${at.row}, line ${at.line}`;
}

function renderLocaleDetail(locale: LocaleSummary): readonly string[] {
  return [
    renderDetailGroup("fuzzy-reused", locale.fuzzyHits.map(renderFuzzyHit)),
    renderDetailGroup("provider-failed", locale.providerFailures),
    renderDetailGroup(
      "notices",
      locale.notices.map((notice) => `[${notice.code}] ${notice.message}`),
    ),
    renderDetailGroup("unfilled", locale.unfilled),
    renderDetailGroup(
      "malformed",
      locale.malformedRows.map((problem) => `${renderPosition(problem)} (${problem.column})`),
    ),
    renderDetailGroup(
      "duplicates",
      locale.duplicateKeys.map((duplicate) => `${duplicate.key} (${renderPosition(duplicate)})`),
    ),
  ].filter((line): line is string => line !== undefined);
}

function renderLocaleLine(locale: LocaleSummary): readonly string[] {
  if (locale.status === "failed") {
    const suffix = locale.error ? ` [${locale.error.code}] ${locale.error.message}` : "";
    return [`  ${locale.locale}: failed${suffix}`, ...renderLocaleDetail(locale)];
  }
  const counts: ReadonlyArray<readonly [number, string, boolean]> = [
    [locale.translated.length, "translated", true],
    [locale.cacheHits.length, "from cache", false],
    [locale.fuzzyHits.length, "fuzzy-reused", false],
    [locale.unchanged.length, "unchanged", true],
    [locale.generated.length, "generated", false],
    [locale.orphaned.length, "orphaned", false],
    [locale.pruned.length, "pruned", false],
    [locale.invalidIcuSource.length, "invalid-ICU skipped", false],
    [locale.integrityMismatches.length, "integrity-withheld", false],
    [locale.providerFailures.length, "provider-failed", false],
    [locale.budgetWithheld.length, "budget-withheld", false],
    [locale.unfilled.length, "unfilled", false],
    [locale.malformedRows.length, "malformed-rows", false],
    [locale.duplicateKeys.length, "duplicate-keys", false],
    [locale.needsReview.length, "needs-review", false],
    [locale.notices.length, "notices", false],
  ];
  const shown = counts
    .filter(([count, , always]) => always || count > 0)
    .map(([count, label]) => `${count} ${label}`);
  const tokenSuffix = locale.usage !== undefined ? `, ${renderTokens(locale.usage)}` : "";
  return [`  ${locale.locale}: ${shown.join(", ")}${tokenSuffix}`, ...renderLocaleDetail(locale)];
}

export function renderRunResultHuman(result: WatchRunResult): string {
  return result.status === "succeeded" ? renderHuman(result.summary) : renderError(result.error);
}

export function renderExportHuman(result: ExportWorkbookResult): string {
  const localeLines = result.locales.map((l) => `  ${l.locale}: ${l.rows} rows`);
  const total = result.locales.reduce((sum, l) => sum + l.rows, 0);
  return [
    `verbatra export -> ${result.path}`,
    ...localeLines,
    `${total} rows across ${result.locales.length} locales`,
  ].join("\n");
}

export function renderCheckHuman(summary: CheckSummary): string {
  const localeLines = summary.locales.map(
    (l) =>
      `  ${l.locale}: ${l.missing} missing, ${l.stale} stale, ${l.upToDate} up-to-date (${
        l.inSync ? "in sync" : "out of sync"
      })`,
  );
  const overall = summary.inSync
    ? "all locales in sync"
    : "out of sync (run verbatra translate to update)";
  return ["verbatra check", ...localeLines, overall].join("\n");
}

const DOCTOR_STATUS_LABELS: Record<DoctorCheckStatus, string> = {
  pass: "ok  ",
  fail: "fail",
  skipped: "skip",
};

export function renderDoctorHuman(result: DoctorResult): string {
  const lines = result.checks.map(
    (entry) => `  [${DOCTOR_STATUS_LABELS[entry.status]}] ${entry.title}: ${entry.detail}`,
  );
  const failed = result.checks.filter((entry) => entry.status === "fail").length;
  const trailer = result.ok
    ? "no problems found"
    : `${failed} ${failed === 1 ? "problem" : "problems"} found (run verbatra doctor again after fixing them)`;
  return ["verbatra doctor", ...lines, trailer].join("\n");
}

const DIFF_GROUP_WIDTH = 14;

function renderDiffGroup(label: string, keys: readonly string[]): string | undefined {
  if (keys.length === 0) {
    return undefined;
  }
  return `    ${`${label}:`.padEnd(DIFF_GROUP_WIDTH)}${keys.join(", ")}`;
}

function renderDiffLocale(locale: LocaleDiff): readonly string[] {
  const total = locale.missing.length + locale.changed.length + locale.orphaned.length;
  if (total === 0) {
    return [`  ${locale.locale}: no pending changes`];
  }
  const header = `  ${locale.locale}: ${locale.missing.length} to add, ${locale.changed.length} to re-translate, ${locale.orphaned.length} orphaned`;
  const groups = [
    renderDiffGroup("add", locale.missing),
    renderDiffGroup("re-translate", locale.changed),
    renderDiffGroup("orphaned", locale.orphaned),
  ].filter((line): line is string => line !== undefined);
  return [header, ...groups];
}

export function renderDiffHuman(summary: DiffSummary): string {
  const localeLines = summary.locales.flatMap(renderDiffLocale);
  const count = summary.locales.length;
  const trailer = `${count} ${count === 1 ? "locale" : "locales"}, ${
    summary.hasPendingChanges ? "pending changes" : "no pending changes"
  }`;
  return ["verbatra diff", ...localeLines, trailer].join("\n");
}

function renderLockHolder(event: LockWaitEvent): string {
  const holder = event.holder;
  if (holder?.pid === undefined && holder?.acquiredAt === undefined) {
    return "";
  }
  const pid = holder.pid !== undefined ? ` by pid ${holder.pid}` : "";
  const since = holder.acquiredAt !== undefined ? ` since ${holder.acquiredAt}` : "";
  return ` (held${pid}${since})`;
}

export function renderLockWaitHuman(event: LockWaitEvent): string {
  const waitedSeconds = Math.round(event.elapsedMs / 1000);
  return (
    `verbatra: waiting for the write lock at ${event.lockPath}${renderLockHolder(event)}; ` +
    `waited ${waitedSeconds}s. If no verbatra process is running, this lock is orphaned and can be deleted.`
  );
}

export function renderLockWaitJson(event: LockWaitEvent): string {
  return JSON.stringify({ type: "lock-wait", ...event });
}

export function renderLockWait(event: LockWaitEvent, json: boolean): string {
  return json ? renderLockWaitJson(event) : renderLockWaitHuman(event);
}

export function renderProgressHuman(event: ProgressEvent): string {
  switch (event.type) {
    case "locale-started":
      return `verbatra: translating ${event.locale}`;
    case "sub-batch":
      return `verbatra: ${event.locale} batch ${event.batchIndex}/${event.totalBatches}`;
    case "locale-finished":
      return `verbatra: ${event.locale} done, ${event.translated} translated`;
    case "run-finished":
      return `verbatra: run finished, ${event.localesCompleted} locales processed`;
  }
}

export function renderProgressJson(event: ProgressEvent): string {
  return JSON.stringify(event);
}

export function renderProgress(event: ProgressEvent, json: boolean): string {
  return json ? renderProgressJson(event) : renderProgressHuman(event);
}

export function renderError(error: RenderableError): string {
  return `verbatra: error [${error.code}] ${error.message}`;
}

export function renderPseudoHuman(result: PseudolocalizeResult): string {
  const lines = [
    "verbatra pseudo",
    `  ${result.locale}: ${result.transformed} of ${result.entries} entries pseudolocalized`,
  ];
  if (result.copied.length > 0) {
    lines.push(`    copied verbatim: ${result.copied.join(", ")}`);
  }
  lines.push(`  ${result.written ? "wrote" : "unchanged"} ${result.path}`);
  return lines.join("\n");
}

const EXTRACT_LIST_LIMIT = 10;

function renderExtractList(label: string, lines: readonly string[]): readonly string[] {
  if (lines.length === 0) {
    return [];
  }
  const shown = lines.slice(0, EXTRACT_LIST_LIMIT);
  const rest = lines.length - shown.length;
  const trailer = rest > 0 ? [`    and ${rest} more`] : [];
  return [`  ${label} (${lines.length}):`, ...shown.map((line) => `    ${line}`), ...trailer];
}

function renderExtractOutcome(result: ExtractResult): string {
  if (result.added.length === 0) {
    return `  no new keys found in ${result.sourcePath}`;
  }
  const verb = result.dryRun ? "would add" : "added";
  return `  ${verb} ${result.added.length} ${result.added.length === 1 ? "key" : "keys"} to ${result.sourcePath}`;
}

export function renderExtractHuman(result: ExtractResult): string {
  const header = `  ${result.scannedFiles} files scanned, ${result.existingKeys} keys already present`;
  const lines = [
    header,
    renderExtractOutcome(result),
    ...renderExtractList(
      "new keys",
      result.added.map((entry) => `${entry.key}  ${entry.file}:${entry.line}`),
    ),
    ...renderExtractList("written with an empty value", result.withoutDefault),
    ...renderExtractList(
      "dynamic keys",
      result.dynamic.map((site) => `${site.file}:${site.line}`),
    ),
    ...renderExtractList(
      "conflicting defaults",
      result.conflicts.map(
        (conflict) =>
          `${conflict.key}  ${conflict.locations.map((site) => `${site.file}:${site.line}`).join(", ")}`,
      ),
    ),
    ...renderExtractList(
      "skipped",
      result.diagnostics.map((entry) => `${entry.file}  ${entry.reason}`),
    ),
  ];
  const trailer = result.dryRun ? "dry run, nothing written" : undefined;
  return ["verbatra extract", ...lines, ...(trailer === undefined ? [] : [trailer])].join("\n");
}
